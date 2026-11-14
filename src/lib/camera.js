// Own the stream so cancellation and unmount also release pending camera requests.
export function createCameraSession({ getUserMedia, video }) {
  let generation = 0;
  let stream = null;

  function stop() {
    generation += 1;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
  }

  async function start() {
    stop();
    const token = generation;
    const next = await getUserMedia({ video: { facingMode: 'user' }, audio: false });
    if (token !== generation) {
      next.getTracks().forEach(track => track.stop());
      return false;
    }
    stream = next;
    video.srcObject = next;
    try {
      await video.play();
      return token === generation;
    } catch (error) {
      if (token !== generation) return false;
      stop();
      throw error;
    }
  }

  return { start, stop };
}
