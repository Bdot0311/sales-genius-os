import * as Sentry from "@sentry/react";

export default function SentryTest() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground gap-6 p-6">
      <h1 className="text-2xl font-bold">Sentry Error Tracking Test</h1>
      <p className="text-muted-foreground text-center max-w-md">
        Click the button below to throw a test error. It should be captured by Sentry.
      </p>
      <button
        type="button"
        onClick={() => {
          throw new Error("This is your first error!");
        }}
        className="inline-flex h-11 items-center justify-center rounded-md bg-destructive px-6 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
      >
        Break the world
      </button>
    </div>
  );
}
