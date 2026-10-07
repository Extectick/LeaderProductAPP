// A stored event is immutable: if it arrived before artifact assembly completed,
// polling the same event cannot symbolicate it. Retry with a fresh synthetic event.
async function verifySymbolication({ send, read, match, sleep, rounds = 6, polls = 6 }) {
  let lastEventId;
  for (let round = 0; round < rounds; round++) {
    lastEventId = await send();
    for (let poll = 0; poll < polls; poll++) {
      const frames = await read(lastEventId);
      if (frames !== null) {
        const frame = frames.find(match);
        if (frame) return { eventId: lastEventId, frame };
        break;
      }
      await sleep(2000);
    }
    if (round + 1 < rounds) await sleep(Math.min(5000 * (round + 1), 15000));
  }
  throw Error('Original source frame did not resolve; release publication is blocked. Event: ' + lastEventId);
}

module.exports = { verifySymbolication };
