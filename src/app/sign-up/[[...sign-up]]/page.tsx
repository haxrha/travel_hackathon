import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="wp-sky wp-sky-animated min-h-screen flex items-center justify-center p-6">
      <SignUp appearance={{ elements: { card: "wp-glass" } }} />
    </div>
  );
}
