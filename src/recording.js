export function createRecordingState(startedAt) {
  return {
    enabled: Boolean(startedAt),
    started_at: startedAt || null
  };
}

export function shouldRecordChange(recordingState) {
  return Boolean(recordingState?.enabled);
}
