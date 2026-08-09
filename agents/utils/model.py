import os
from pathlib import Path

from dotenv import load_dotenv
from httpx import AsyncClient, HTTPStatusError
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.retries import AsyncTenacityTransport, RetryConfig
from tenacity import retry_if_exception_type, stop_after_attempt, wait_exponential

_AGENTS_DIR = Path(__file__).parents[1]
_REPO_ROOT = _AGENTS_DIR.parent
# Prefer agents/.env; also pick up a root Next.js .env.local if present.
load_dotenv(_AGENTS_DIR / ".env")
load_dotenv(_REPO_ROOT / ".env.local", override=False)
load_dotenv(_REPO_ROOT / ".env", override=False)


def _google_api_key() -> str:
    """Accept Next.js-style and Pydantic AI / Gemini env names."""
    return (
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_GENERATIVE_AI_API_KEY")
        or ""
    )


def create_retrying_client():
    """Retry transient Gemini errors without multi-minute freezes on 429s.

    Previous config used wait_fixed(60) × 5 attempts ≈ up to 4 minutes of
    sleeping per rate-limit hit, which made Planning/SubAgent runs look hung.
    """

    def should_retry_status(response):
        if response.status_code in (429, 502, 503, 504):
            response.raise_for_status()

    transport = AsyncTenacityTransport(
        config=RetryConfig(
            retry=retry_if_exception_type((HTTPStatusError, ConnectionError)),
            # 2s → 4s → 8s (cap), at most 3 tries total
            wait=wait_exponential(multiplier=2, min=2, max=8),
            stop=stop_after_attempt(3),
            reraise=True,
        ),
        validate_response=should_retry_status,
    )
    return AsyncClient(transport=transport, timeout=60.0)


client = create_retrying_client()

_api_key = _google_api_key()
if not _api_key:
    raise RuntimeError(
        "Set GOOGLE_API_KEY (or GEMINI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY) in agents/.env"
    )

# Flash is fine; free-tier RPM is the bottleneck, not model size.
model_gemini_retry = GoogleModel(
    os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
    provider=GoogleProvider(api_key=_api_key, http_client=client),
)
