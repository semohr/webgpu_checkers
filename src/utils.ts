export async function init_gpu() {
    // Check if gpu is available
    if (!navigator.gpu) throw new Error('WebGPU not supported');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error("Couldn't request WebGPU adapter.");
    const device = await adapter.requestDevice();
    if (!device) throw Error("Couldn't request WebGPU device.");

    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: format,
    });
    return { device, canvas, format, context };
}


export function observe_and_resize(canvas : HTMLCanvasElement, callback: Function) {

    const devicePixelRatio = window.devicePixelRatio || 1;

    const observer = new ResizeObserver(entries => {
        for (let entry of entries) {
            // Get parent dimensions
            console.log(entry);
            const cr = entry.contentRect;
            canvas.width = cr.width * devicePixelRatio;
            canvas.height = cr.height * devicePixelRatio;
            callback();
        }
    });
    // trigger resize
    canvas.width = canvas.parentElement!.clientWidth * devicePixelRatio;
    canvas.height = canvas.parentElement!.clientHeight * devicePixelRatio;
    observer.observe(canvas.parentElement!);

}