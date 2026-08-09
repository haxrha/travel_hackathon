"""Travel multi-agent stack with Rain sandbox spend on confirmed bookings.

Research flights/hotels via Tavily sub-agents; pay via create_booking_agent using
AGENT_TOOLS from utils.rain_tools (fund_treasury, pay_merchant, purchase_history).

Requires agents/.env: RAIN_API_KEY, RAIN_USER_ID, RAIN_CONTRACT_ID, TAVILY_API_KEY,
plus credentials for the Gemini model used by utils.model.

Run:  uv run python rain_agent.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

import logfire
from pydantic_ai import Agent
from pydantic_ai.common_tools.tavily import tavily_search_tool
from pydantic_ai_harness.planning import Planning
from pydantic_ai_harness.subagents import SubAgent, SubAgents

from utils.model import model_gemini_retry
from utils.rain_tools import AGENT_TOOLS, API_KEY, purchase_history

PROMPTS_DIR = Path(__file__).parent / "prompts"
DATA_PATH = Path(__file__).parent / "data01.json"


def load_instructions(name: str) -> str:
    """Read an agent's instructions from prompts/<name>.j2."""
    return (PROMPTS_DIR / f"{name}.j2").read_text()


def build_travel_agent(*, fast: bool = False) -> Agent:
    tavily_key = os.getenv("TAVILY_API_KEY", "")
    if not API_KEY:
        raise RuntimeError(
            "RAIN_API_KEY is not set — put RAIN_API_KEY, RAIN_USER_ID, "
            "RAIN_CONTRACT_ID in agents/.env"
        )
    if not tavily_key:
        raise RuntimeError("TAVILY_API_KEY is not set — put it in agents/.env")

    create_booking_agent = Agent(
        model=model_gemini_retry,
        name="create_booking_agent",
        description=(
            "Books and pays for exact confirmed flights and hotel rooms using the "
            "company card. Provide complete per-traveler details; it funds the "
            "treasury, pays each merchant, and returns receipts."
        ),
        instructions=load_instructions("create_booking_agent"),
        tools=AGENT_TOOLS,
    )

    research_hotels_agent = Agent(
        model=model_gemini_retry,
        name="reserach_hotels_agent",
        description=(
            "Researches hotel options for a destination and reports back a short "
            "list, without booking"
        ),
        instructions=load_instructions("reserach_hotels_agent"),
        tools=[tavily_search_tool(tavily_key)],
    )

    research_flights_agent = Agent(
        model=model_gemini_retry,
        name="research_flights_agent",
        description=(
            "Researches flight options for a route and dates and reports back a "
            "short list, without booking"
        ),
        instructions=load_instructions("research_flights_agent"),
        tools=[tavily_search_tool(tavily_key)],
    )

    capabilities = [
        SubAgents(
            agents=[
                SubAgent(create_booking_agent),
                SubAgent(research_hotels_agent),
                SubAgent(research_flights_agent),
            ]
        ),
    ]
    # Planning() adds extra Gemini turns for every step update — skip in fast mode.
    if not fast:
        capabilities.insert(0, Planning())

    return Agent(
        model=model_gemini_retry,
        name="travel_agent",
        instructions=load_instructions("travel_agent"),
        capabilities=capabilities,
    )


def audit_purchases(budget_usd: float | None = None, limit: int = 20) -> None:
    """Print Rain ledger spend so we trust receipts over model text."""
    purchases = purchase_history(limit=limit)
    if not purchases:
        print("\nNo spend transactions in Rain yet.")
        return

    print("\nRain purchase history (newest first):")
    for purchase in purchases:
        print(
            f"{purchase['amount_usd']:>10.2f}  {purchase['status']:<10} "
            f"{purchase['merchant']}"
        )

    total = sum(p["amount_usd"] for p in purchases)
    print(f"\n{total:>10.2f}  total of {len(purchases)} payments", end="")
    if budget_usd is not None:
        print(f" — budget ${budget_usd:,.2f}")
        print("over budget!" if total > budget_usd else "within budget")
    else:
        print()


def main() -> None:
    # RAIN_AGENT_FAST=1 skips Planning() capability (fewer Gemini round-trips).
    fast = os.getenv("RAIN_AGENT_FAST", "1").strip() not in {"0", "false", "False"}

    print("→ loading env + configuring logfire…", flush=True)
    logfire.configure()
    logfire.instrument_pydantic_ai()

    trip_request = DATA_PATH.read_text()
    budget_usd: float | None = None
    try:
        payload = json.loads(trip_request)
        budget_usd = float(payload["trip_request"]["budget"]["total_budget"])
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        pass

    # data01.json has approval_status=pending; for CLI we approve so booking/Rain can run.
    prompt = (
        trip_request
        + "\n\nORGANIZER DECISION: APPROVED. "
        "Call research_flights_agent ONCE and reserach_hotels_agent ONCE, then assemble "
        "the plan and immediately book/pay via create_booking_agent. "
        "Do not wait for another confirmation. Limit web searches."
    )

    mode = "FAST (no Planning capability)" if fast else "FULL (Planning + SubAgents)"
    print(f"→ building travel agent [{mode}]…", flush=True)
    print(
        "  Tip: free-tier Gemini 429s are common. Retries are short now; "
        "set RAIN_AGENT_FAST=0 for the full Planning UI.",
        flush=True,
    )
    travel_agent = build_travel_agent(fast=fast)
    print(
        "→ running trip (research → plan → book/pay). Watch Logfire for tool traces.",
        flush=True,
    )
    result = travel_agent.run_sync(prompt)
    print("\n=== agent output ===\n", flush=True)
    print(result.output, flush=True)
    print("\n=== rain ledger audit ===", flush=True)
    audit_purchases(budget_usd=budget_usd)


if __name__ == "__main__":
    main()
