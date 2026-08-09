import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="wp-sky wp-sky-animated min-h-screen flex items-center justify-center p-6">
      <SignIn appearance={{ elements: { card: "wp-glass" } }} />
    </div>
  );
}
