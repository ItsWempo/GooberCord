// Credential relay client (login-parity rescue): GooberCord's password
// pepper lives in a wrangler secret that is NOT guaranteed to equal the
// forum's PASSWORD_PEPPER — and when the values drifted, members could not
// sign in on either side while the forum itself stayed healthy. Both apps
// share one D1 users table, so instead of betting on the secrets, GC
// delegates credential work to the forum worker over a token-gated relay
// (api/relay.mjs on the forum side):
//   relayVerify → "are these credentials correct under the forum pepper?"
//   relaySet    → "store this new password under the forum pepper"
// relaySet on register/convergence writes fresh hashes under the forum
// pepper, so a hash written by GC verifies on the forum and vice versa.
// The token is the whole auth (RELAY_TOKEN secret on both workers);
// responses carry no credential material — ids, usernames, and roles only.
// Every call degrades gracefully: an unconfigured/absent RELAY_TOKEN (or an
// unreachable forum) returns null and callers keep their existing behavior.
const RELAY_ORIGIN = "https://wempos-forum.itswempo.workers.dev";
const RELAY_TIMEOUT_MS = 10_000;

async function relayCall(env, path, body) {
  if (!env.RELAY_TOKEN || typeof env.RELAY_TOKEN !== "string") return null;

  let response;
  try {
    response = await fetch(RELAY_ORIGIN + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Relay-Token": env.RELAY_TOKEN,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
    });
  } catch {
    return null; // forum unreachable — fall back to local behavior
  }

  if (!response.ok) return null;

  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function relayVerify(env, username, password) {
  return relayCall(env, "/api/relay/password-verify", { username, password });
}

export async function relaySet(env, username, password) {
  return relayCall(env, "/api/relay/password-set", { username, password });
}
