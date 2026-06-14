export const loader = () => {
  return new Response(JSON.stringify({ status: "ok", version: "2" }), {
    headers: { "Content-Type": "application/json" },
  });
};
