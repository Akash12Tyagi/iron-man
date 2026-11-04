// Meshes one sculpt per message off the main thread.
import { JOBS } from "./sculpts.js";

self.onmessage = ({ data: { id, name, quality } }) => {
  const geo = JOBS[name](1 / quality);
  const position = geo.attributes.position.array.slice();
  const normal = geo.attributes.normal.array.slice();
  const index = Uint32Array.from(geo.index.array);
  self.postMessage({ id, name, position, normal, index }, [position.buffer, normal.buffer, index.buffer]);
};
