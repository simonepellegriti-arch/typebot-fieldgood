export const RootPage = ({ dashboardUrl }: { dashboardUrl: string }) => (
  <div
    style={{
      height: "100dvh",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      flexDirection: "column",
    }}
  >
    <div>
      <h1 style={{ fontWeight: "bold", fontSize: "30px" }}>
        Welcome to FIELDBOT
      </h1>
      <p>
        FIELDBOT is Fieldgood&apos;s conversational survey platform: structured
        market research interviews on the web and WhatsApp.
      </p>
      <p>
        Go to the <a href={dashboardUrl}>dashboard</a>.
      </p>
    </div>
  </div>
);
