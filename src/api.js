let token = "";
export async function session() {
  const response = await fetch("/api/session");
  if (!response.ok) throw new Error("Unable to connect to the local workbench");
  const data = await response.json();
  token = data.token;
  return data;
}
export async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export const call = (name, args = {}) =>
  request(`/api/tools/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
export const fileUrl = (name) => `/api/files/${name}?token=${token}`;
export const apiUrl = (url) => `${url}?token=${token}`;
export const wsUrl = (route) =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${route}?token=${token}`;
export function downloadText(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
