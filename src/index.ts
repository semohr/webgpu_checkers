import { App } from "./logic/app";

async function main() {
    // Init gpu
    const canvas = document.getElementById("canvas") as HTMLCanvasElement;
    const app = new App(canvas);
    await app.init();

    // Add eventlistener for fullscreen
    document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) {
            const wrapper = document.getElementById("wrapper")!;
            canvas.width = wrapper.clientWidth;
            canvas.height = wrapper.clientHeight;
        } else {
            canvas.width = 640;
            canvas.height = 480;
        }
    });

    app.run();
}

document.addEventListener("DOMContentLoaded", async () => {
    await main().catch((e) => {
        console.error(e);
        document.getElementById("wrapper")!.innerHTML = e.message;
    });
});
