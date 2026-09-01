export function resolveStreamingInputSampleRate(
  currentSampleRate: number | null,
  incomingSampleRate: number,
): number {
  if (!Number.isFinite(incomingSampleRate) || incomingSampleRate <= 0) {
    throw new Error(`Invalid streaming audio sample rate: ${incomingSampleRate}`)
  }

  if (currentSampleRate !== null && currentSampleRate !== incomingSampleRate) {
    throw new Error(
      `Streaming audio sample rate changed from ${currentSampleRate} Hz to ${incomingSampleRate} Hz`,
    )
  }

  return currentSampleRate ?? incomingSampleRate
}

export function getStreamingTailPaddingSampleCount(
  inputSampleRate: number,
  paddingMilliseconds: number,
): number {
  if (!Number.isFinite(inputSampleRate) || inputSampleRate <= 0) return 0
  if (!Number.isFinite(paddingMilliseconds) || paddingMilliseconds <= 0) return 0
  return Math.round((inputSampleRate * paddingMilliseconds) / 1000)
}
