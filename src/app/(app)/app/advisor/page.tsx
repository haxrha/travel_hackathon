import AdvisorMode from "@/components/app/AdvisorMode";
import PageAsciiHero from "@/components/app/PageAsciiHero";

export default function AdvisorPage() {
  return (
    <div className="w-full space-y-6">
      <PageAsciiHero
        variant="advisor"
        eyebrow="Studio"
        title="Advisor"
        subtitle="AI does the grunt work. You own the client relationship."
      />
      <div className="max-w-3xl">
        <AdvisorMode />
      </div>
    </div>
  );
}
