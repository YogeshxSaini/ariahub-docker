import { useEffect, useMemo, useState } from "react"

const API = "/api"

// The API key is injected server-side by nginx (see nginx.conf.template),
// not by the browser, so the frontend never needs to know it. This helper
// just centralizes the base path -- kept as a thin wrapper in case more
// shared request logic is needed later.
function apiFetch(path, options = {}) {
  return fetch(`${API}${path}`, options)
}

function formatBytes(value) {
  const bytes = Number(value || 0)

  if (!bytes) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )

  return `${(
    bytes / Math.pow(1024, index)
  ).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatSpeed(value) {
  return `${formatBytes(value)}/s`
}

function getFilename(download) {
  const path = download.files?.[0]?.path

  if (path) return path.split("/").pop()

  if (download.filename) return download.filename

  try {
    return (
      new URL(download.url)
        .pathname
        .split("/")
        .pop() || "nknown file"
    )
  } catch {
    return "Unknown file"
  }
}

function progress(download) {
  const completed = Number(download.completedLength || 0)
  const total = Number(download.totalLength || 0)

  if (!total) return 0

  return Math.min(100, (completed / total) * 100)
}

function eta(download) {
  const completed = Number(download.completedLength || 0)
  const total = Number(download.totalLength || 0)
  const speed = Number(download.downloadSpeed || 0)

  if (!speed || total <= completed) return "--"

  const seconds = (total - completed) / speed

  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`

  return `${Math.floor(seconds / 3600)}h`
}

function statusClass(status) {
  if (status === "active")
    return "bg-blue-500/10 text-blue-400"

  if (status === "paused")
    return "bg-yellow-500/10 text-yellow-400"

  if (status === "complete")
    return "bg-green-500/10 text-green-400"

  if (status === "error")
    return "bg-red-500/10 text-red-400"

  return "bg-zinc-800 text-zinc-400"
}

function DownloadCard({
  download,
  onPause,
  onResume,
  onRemove,
}) {
  const percent = progress(download)

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">

      <div className="flex items-start justify-between gap-4">

        <div className="flex min-w-0 items-start gap-4">

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xl text-blue-400">
            ↓
          </div>

          <div className="min-w-0">

            <h3 className="truncate font-semibold text-white">
              {getFilename(download)}
            </h3>

            <p className="mt-1 truncate text-xs text-zinc-600">
              GID {download.gid}
            </p>

          </div>

        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
            download.status
          )}`}
        >
          {download.status || "unknown"}
        </span>

      </div>

      <div className="mt-6">

        <div className="mb-2 flex justify-between text-xs">

          <span className="text-zinc-500">
            {formatBytes(download.completedLength)} /{" "}
            {formatBytes(download.totalLength)}
          </span>

          <span className="text-zinc-300">
            {percent.toFixed(1)}%
          </span>

        </div>

        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">

          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500"
            style={{
              width: `${percent}%`,
            }}
          />

        </div>

      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">

        <div className="flex flex-wrap gap-4 text-xs text-zinc-500">

          <span>
            {formatSpeed(download.downloadSpeed)}
          </span>

          <span>
            ETA {eta(download)}
          </span>

          <span>
            {download.connections || 0} connections
          </span>

        </div>

        <div className="flex gap-2">

          {download.status === "active" && (
            <button
              onClick={() => onPause(download.gid)}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Pause
            </button>
          )}

          {download.status === "paused" && (
            <button
              onClick={() => onResume(download.gid)}
              className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-400"
            >
              Resume
            </button>
          )}

          <button
            onClick={() => onRemove(download.gid)}
            className="rounded-lg border border-red-900/50 px-3 py-2 text-xs text-red-400 hover:bg-red-950/30"
          >
            Remove
          </button>

        </div>

      </div>

      {download.errorMessage && (
        <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-xs text-red-400">
          {download.errorMessage}
        </div>
      )}

    </div>
  )
}

function AddModal({ open, close, refresh }) {
  const [url, setUrl] = useState("")
  const [filename, setFilename] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!open) return null

  async function submit(event) {
    event.preventDefault()

    if (!url.trim()) {
      setError("Enter a URL.")
      return
    }

    setLoading(true)
    setError("")

    try {

      const response = await apiFetch(
        `/downloads`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: url.trim(),
            filename: filename.trim() || null,
          }),
        }
      )

      let data = {}
      try {
        data = await response.json()
      } catch {
        // Response wasn't JSON (e.g. a proxy/server error page) -- fall
        // back to a generic message instead of showing a raw parse error.
      }

      if (!response.ok) {
        throw new Error(
          data.detail || `Unable to start download (HTTP ${response.status})`
        )
      }

      setUrl("")
      setFilename("")

      await refresh()
      close()

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">

      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-6">

        <div className="flex items-start justify-between">

          <div>
            <h2 className="text-lg font-semibold">
              Add Download
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Enter a URL and aria2 will download it.
            </p>
          </div>

          <button
            onClick={close}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            ×
          </button>

        </div>

        <form
          onSubmit={submit}
          className="mt-6 space-y-5"
        >

          <div>

            <label className="mb-2 block text-sm text-zinc-300">
              URL
            </label>

            <input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/file.zip"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />

          </div>

          <div>

            <label className="mb-2 block text-sm text-zinc-300">
              Filename
              <span className="ml-2 text-xs text-zinc-600">
                optional
              </span>
            </label>

            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="Automatic filename"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-blue-500"
            />

          </div>

          {error && (
            <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">

            <button
              type="button"
              onClick={close}
              className="rounded-xl border border-zinc-800 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Cancel
            </button>

            <button
              disabled={loading}
              className="rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-50"
            >
              {loading ? "Starting..." : "Start Download"}
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}

export default function App() {

  const [downloads, setDownloads] = useState([])
  const [online, setOnline] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  async function refresh() {

    try {

      const response = await apiFetch(
        `/downloads`
      )

      if (!response.ok) {
        throw new Error()
      }

      const data = await response.json()

      setDownloads(data.downloads || [])
      setOnline(true)

    } catch {

      setOnline(false)

    }
  }

  async function pause(gid) {

    await apiFetch(
      `/downloads/${gid}/pause`,
      {
        method: "POST",
      }
    )

    await refresh()
  }

  async function resume(gid) {

    await apiFetch(
      `/downloads/${gid}/resume`,
      {
        method: "POST",
      }
    )

    await refresh()
  }

  async function remove(gid) {

    await apiFetch(
      `/downloads/${gid}`,
      {
        method: "DELETE",
      }
    )

    await refresh()
  }

  useEffect(() => {

    refresh()

    const timer = setInterval(
      refresh,
      1500
    )

    return () => clearInterval(timer)

  }, [])

  const active = downloads.filter(
    d => d.status === "active"
  )

  const paused = downloads.filter(
    d => d.status === "paused"
  )

  const speed = useMemo(
    () =>
      downloads.reduce(
        (sum, item) =>
          sum +
          Number(item.downloadSpeed || 0),
        0
      ),
    [downloads]
  )

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      <div className="flex min-h-screen">

        <aside className="hidden w-64 shrink-0 border-r border-zinc-800 md:block">

          <div className="flex h-16 items-center border-b border-zinc-800 px-6">

            <div className="flex items-center gap-3">

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 font-bold">
                A
              </div>

              <span className="text-lg font-semibold">
                AriaHub
              </span>

            </div>

          </div>

          <nav className="p-4">

            <div className="rounded-xl bg-zinc-800 px-4 py-3 text-sm">
              ↓ &nbsp; Downloads
            </div>

            <div className="mt-1 rounded-xl px-4 py-3 text-sm text-zinc-500">
              ✓ &nbsp; Completed
            </div>

            <div className="mt-1 rounded-xl px-4 py-3 text-sm text-zinc-500">
              ⚙ &nbsp; Settings
            </div>

          </nav>

        </aside>

        <main className="min-w-0 flex-1">

          <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-6">

            <div>

              <h1 className="text-lg font-semibold">
                Downloads
              </h1>

              <div className="mt-1 flex items-center gap-2 text-xs">

                <span
                  className={`h-2 w-2 rounded-full ${
                    online
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                />

                <span className="text-zinc-500">
                  {online
                    ? "Server online"
                    : "Server offline"}
                </span>

              </div>

            </div>

            <button
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold hover:bg-blue-400"
            >
              + Add Download
            </button>

          </header>

          <div className="mx-auto max-w-6xl p-4 sm:p-6">

            <div className="grid gap-4 sm:grid-cols-4">

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">

                <p className="text-sm text-zinc-500">
                  Downloads
                </p>

                <p className="mt-2 text-3xl font-semibold">
                  {downloads.length}
                </p>

              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">

                <p className="text-sm text-zinc-500">
                  Active
                </p>

                <p className="mt-2 text-3xl font-semibold">
                  {active.length}
                </p>

              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">

                <p className="text-sm text-zinc-500">
                  Paused
                </p>

                <p className="mt-2 text-3xl font-semibold">
                  {paused.length}
                </p>

              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">

                <p className="text-sm text-zinc-500">
                  Speed
                </p>

                <p className="mt-2 text-3xl font-semibold">
                  {formatSpeed(speed)}
                </p>

              </div>

            </div>

            <section className="mt-8">

              <h2 className="font-semibold">
                Current Downloads
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Live aria2 activity
              </p>

              <div className="mt-4 space-y-4">

                {downloads.length === 0 ? (

                  <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">

                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 text-2xl">
                      ↓
                    </div>

                    <h3 className="mt-4 font-medium">
                      No downloads
                    </h3>

                    <p className="mt-1 text-sm text-zinc-500">
                      Add a URL to start downloading.
                    </p>

                    <button
                      onClick={() =>
                        setModalOpen(true)
                      }
                      className="mt-5 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold hover:bg-blue-400"
                    >
                      Add Download
                    </button>

                  </div>

                ) : (

                  downloads.map(
                    download => (
                      <DownloadCard
                        key={download.gid}
                        download={download}
                        onPause={pause}
                        onResume={resume}
                        onRemove={remove}
                      />
                    )
                  )

                )}

              </div>

            </section>

          </div>

        </main>

      </div>

      <AddModal
        open={modalOpen}
        close={() => setModalOpen(false)}
        refresh={refresh}
      />

    </div>
  )
}
