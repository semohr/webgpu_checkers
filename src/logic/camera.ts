import { mat4, vec3 } from "gl-matrix";

/** Describes camera struct in shaders.wgsl
 *  struct Camera {
 *       projection : matrix4x4f,
 *       view : matrix4x4f,
 *       position: vec3f,
 *   };
 *
 */
export class Camera {
    buffer: GPUBuffer;

    // Camera data
    projection: mat4;
    view: mat4;
    position: vec3;
    look_at: vec3;

    // Camera data
    mouse_down: boolean = false;
    mouse_x: number = 0;
    mouse_y: number = 0;

    constructor() {
        // Create initial projection
        this.projection = mat4.create();
        this.view = mat4.create();
        this.position = vec3.create();
    }

    public async init(device: GPUDevice, canvas: HTMLCanvasElement) {
        // Perspective projection
        mat4.perspective(
            this.projection,
            Math.PI / 4,
            canvas.width / canvas.height,
            0.1,
            1000.0
        );

        // Initial position for camera
        this.position = vec3.fromValues(0, 0, 100);
        this.look_at = vec3.fromValues(0, 0, 0);
        mat4.lookAt(this.view, this.position, this.look_at, [0, 0, 1]);

        // Create buffer
        const usage = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            label: "Camera",
            size: 64 * 2 + 16, // 64 bytes for each matrix, 12 bytes for vec4f
            usage: usage,
        };

        this.buffer = device.createBuffer(descriptor);

        // Write initial data
        this.writeBuffer(device);
    }
    public writeBuffer(device: GPUDevice) {
        // Write data
        device.queue.writeBuffer(this.buffer, 0, <ArrayBuffer>this.projection);
        device.queue.writeBuffer(this.buffer, 64, <ArrayBuffer>this.view);
        device.queue.writeBuffer(this.buffer, 128, <ArrayBuffer>this.position);
    }

    public canvas_resize(device: GPUDevice, canvas: HTMLCanvasElement) {
        // Perspective projection
        const pixelRatio = window.devicePixelRatio || 1;
        mat4.perspective(
            this.projection,
            Math.PI / 4,
            (canvas.width * pixelRatio) / (canvas.height * pixelRatio),
            0.1,
            1000.0
        );

        // Write data
        device.queue.writeBuffer(this.buffer, 0, <ArrayBuffer>this.projection);
    }

    set_position(pos: vec3) {
        this.position = pos;
        mat4.lookAt(this.view, this.position, this.look_at, [0, 0, 1]);
    }

    set_look_at(look_at: vec3) {
        this.look_at = look_at;
        mat4.lookAt(this.view, this.position, this.look_at, [0, 0, 1]);
    }
}
