// Meshes one sculpt per message off the main thread (with baked occlusion).
import { JOBS } from "./sculpts.js";

self.onmessage = ({ data: { id, name, quality } }) => {
  const geo = JOBS[name](1 / quality);
  const position = geo.attributes.position.array.slice();
  const normal = geo.attributes.normal.array.slice();
  const ao = geo.attributes.aAO.array.slice();
  const index = Uint32Array.from(geo.index.array);
  self.postMessage({ id, name, position, normal, ao, index }, [position.buffer, normal.buffer, ao.buffer, index.buffer]);
};
