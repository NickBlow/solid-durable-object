// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

// biome-ignore lint: It's there, don't worry
mount(() => <StartClient />, document.getElementById("app")!);
