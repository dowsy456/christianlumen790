/* RTDB audio is stored in immutable, ordered parts. Untagged MPEG/ADTS byte
 * streams can begin decoding while later parts are still in flight. Other
 * containers and incompatible decoders use the same verified complete blob. */
(function (App) {
  'use strict';
  const streams = new Map();
  App.releaseMusicStream = url => streams.get(url)?.dispose();
  App.retryMusicStream = url => streams.get(url)?.retry();
  App.createMusicStream = function (track, job, onError) {
    const mime = String(track.mime || '').toLowerCase().split(';')[0];
    if (track.chunkCount < 2 || !['audio/mpeg', 'audio/aac'].includes(mime) || !window.MediaSource?.isTypeSupported(mime)) return '';
    const source = new MediaSource(), url = URL.createObjectURL(source);
    let buffer, next = 0, failure = false, disposed = false, complete = false;
    function detach() {
      job?.listeners.delete(pump); job = null;
      buffer?.removeEventListener('updateend', pump);
      buffer?.removeEventListener('error', retry);
      source.removeEventListener('sourceopen', open);
    }
    function dispose() {
      disposed = true; detach(); streams.delete(url); URL.revokeObjectURL(url);
    }
    function retry() {
      if (disposed) return false;
      failure = true;
      // Deliver an error only after the selected media element owns this URL.
      if (source.readyState !== 'closed' || buffer) { detach(); onError(url); }
      return true;
    }
    function pump() {
      if (!buffer || buffer.updating || disposed || failure || source.readyState !== 'open') return;
      try {
        const part = job.parts[next];
        if (part) { buffer.appendBuffer(part); next++; }
        else if (complete && next === track.chunkCount) { source.endOfStream(); detach(); }
      } catch { retry(); }
    }
    function open() {
      if (failure) { retry(); return; }
      try {
        buffer = source.addSourceBuffer(mime);
        if (Number(track.duration) > 0) source.duration = Number(track.duration);
        buffer.addEventListener('updateend', pump); buffer.addEventListener('error', retry);
        pump();
      } catch { retry(); }
    }
    streams.set(url, { dispose, retry });
    job.listeners.add(pump);
    source.addEventListener('sourceopen', open, { once: true });
    job.done.then(() => { complete = true; pump(); }, retry);
    return url;
  };
  App.register('music/audio-stream', () => {});
})(globalThis.ChatApp);
