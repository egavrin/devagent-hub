/**
 * Wraps a LauncherFactory to present a single launcher interface.
 * Routes each launch() call to the correct profile-configured launcher
 * based on the phase name. Drop-in replacement for RunLauncher.
 */
export class PhaseDispatchLauncher {
    factory;
    streaming;
    constructor(factory, options) {
        this.factory = factory;
        this.streaming = options?.streaming ?? false;
    }
    launch(params) {
        if (this.streaming) {
            return this.factory.getStreamingLauncher(params.phase).launch(params);
        }
        return this.factory.getLauncher(params.phase).launch(params);
    }
}
