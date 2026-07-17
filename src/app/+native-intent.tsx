export function redirectSystemPath({ path }: { path: string }) {
  try {
    const url = new URL(path, "zkpassport://")
    if (url.pathname === "/r") {
      return "/"
    }
    return path
  } catch {
    return "/"
  }
}
