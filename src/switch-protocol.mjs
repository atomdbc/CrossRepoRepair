// Switch 0.31.0 reports its current protocol (9) even when accepting client 6.
// Verify overlapping advertised ranges and the echoed client, not equality to 9.
export function acceptsConnectionState(state, roomId, revision) {
  const server = state?.server?.contracts?.['agent-protocol'];
  return Array.isArray(state?.rooms) && state.rooms.includes(roomId) &&
    Number.isSafeInteger(state.cursor) && state.cursor >= 0 &&
    Number.isSafeInteger(state.generation) && state.generation >= 0 &&
    Number.isSafeInteger(server?.speaks) && Number.isSafeInteger(server?.accepts) &&
    server.accepts <= revision && server.speaks >= revision &&
    state.client?.speaks === revision && state.client?.accepts === revision;
}
