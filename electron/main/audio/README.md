# audio/

Main-process audio pipeline for recording sessions and chunked transcription.

## Files

- `index.ts` - Re-exports the audio module surface.
- `session-manager.ts` - Owns the active recording session lifecycle, `sessionId`, and HUD state transitions, including the initial transcribing step after recording stops.
- `processor.ts` - Accepts audio chunks, writes temp files, converts to MP3 for GLM or 16k mono WAV for local SenseVoice, calls the configured ASR provider, merges chunk text in order, promotes the HUD into the refine step when applicable, logs final line-break metadata, and runs the final refine/history/inject step once.
- `converter.ts` - Initializes FFmpeg and converts captured audio to MP3 or 16k mono WAV, with optional low-volume gain.

## Current Flow

1. The renderer records one session for up to 3 minutes and rotates internal chunks every 29 seconds.
2. The main process tracks chunk work by `sessionId + chunkIndex` and can process chunk ASR requests out of order.
3. Finalization only runs after the final chunk has been seen and every chunk from `0..finalChunkIndex` has produced text.
4. Refinement, line-break-aware final text logging, history writes, and text injection happen once per session after the merged transcript is ready.
5. Any chunk failure or session cancellation aborts the session and discards late results.
