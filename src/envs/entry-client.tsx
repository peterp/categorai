import { memoize } from "lodash";

async function entryClient() {
  // NOTE: `react-server-dom-webpack` uses this global to load modules,
  // so we need to define it here before importing "react-server-dom-webpack."
  globalThis.__webpack_require__ = memoize(function (id: string) {
    const module = import(/* @vite-ignore */ id);
    return module;
  });

  const rootEl = document.getElementById("root");
  if (!rootEl) {
    throw new Error('no element with id "root"');
  }

  const React = await import("react");
  const { hydrateRoot } = await import("react-dom/client");
  const { createFromReadableStream, createFromFetch, encodeReply } = await import(
    "react-server-dom-webpack/client.browser"
  );
  const { rscStream } = await import("rsc-html-stream/client");

  let rscPayload;
  rscPayload ??= createFromReadableStream(rscStream);

  let setRscPayload: (v: Promise<unknown>) => void;

  function Content() {
    const [streamData, setStreamData] = React.useState(rscPayload);
    const [_isPending, startTransition] = React.useTransition();
    setRscPayload = (v) => startTransition(() => setStreamData(v));
    return React.use(streamData);
  }

  globalThis.__rsc_callServer = async function callServer(id, args) {
    const url = new URL(window.location.href);
    url.searchParams.set("__rsc", "");
    url.searchParams.set("__rsc_action_id", id);

    const streamData = createFromFetch(
      fetch(url, {
        method: "POST",
        body: await encodeReply(args),
      }),
      { callServer: globalThis.__rsc_callServer }
    );

    setRscPayload(streamData);
    const result = await streamData;
    return result.actionResult;
  };

  hydrateRoot(rootEl, <Content />);

  // Replace navigation.
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(state, title, url) {
    originalPushState.apply(this, [state, title, url]);
    handleNavigation(url as string);
  };

  history.replaceState = function(state, title, url) {
    originalReplaceState.apply(this, [state, title, url]);
    handleNavigation(url as string);
  };


  function handleNavigation(url: string) {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set("__rsc", "");

    const streamData = createFromFetch(fetch(parsedUrl), {
      callServer: globalThis.__rsc_callServer
    });
    setRscPayload(streamData);
  }


  // Handle "LIVE"

  window.addEventListener('load', () => {
    const sse = new EventSource('http://localhost:8913');
    sse.addEventListener('reload', () => {
      handleNavigation(window.location.toString())
      //window.location.reload();
    });
    window.addEventListener('beforeunload', () => {
      sse.close();
    });
    // TODO (RSC): Handle disconnect / error states.
  });
}

entryClient();
