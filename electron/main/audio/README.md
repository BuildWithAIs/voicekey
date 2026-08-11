# audio/

Main-process audio pipeline for recording sessions and chunked transcription.

## Files

- `index.ts` - Re-exports the audio module surface.
- `session-manager.ts` - Owns the active recording session lifecycle, `sessionId`, selected microphone device forwarding, and HUD state transitions, including the initial transcribing step after recording stops. Runs a 10s watchdog after SESSION_STOP that aborts the session if the final chunk never arrives, and exposes `handleBackgroundRendererGone` to fail the active session when the hidden recording renderer crashes or hangs.
- `processor.ts` - Accepts audio chunks, writes temp files, converts them to 16k mono WAV for local SenseVoice, calls the local ASR provider, merges chunk text in order, promotes the HUD into the refine step when applicable, logs final line-break metadata, and runs the final refine/history/inject step once. Empty chunk buffers are recorded as empty transcripts (renderer placeholder markers); an empty final transcript completes the session without refine/history/injection. Exposes `hasReceivedFinalChunk`/`abortChunkSession` for the session watchdog.
- `converter.ts` - Initializes FFmpeg and converts captured audio to MP3 or 16k mono WAV, with optional low-volume gain.

## Current Flow

1. The main process starts a session and sends the hidden recorder the `sessionId` plus the saved microphone device ID when one is selected.
2. The renderer records one session for up to 5 minutes and rotates internal chunks every 30 seconds.
3. The main process tracks chunk work by `sessionId + chunkIndex` and can process chunk ASR requests out of order.
4. Finalization only runs after the final chunk has been seen and every chunk from `0..finalChunkIndex` has produced text.
5. Refinement, line-break-aware final text logging, history writes, and text injection happen once per session after the merged transcript is ready.
6. Any chunk failure or session cancellation aborts the session and discards late results.
