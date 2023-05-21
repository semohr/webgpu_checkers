/** Describes lights structs in shaders.wgsl
 * struct PointLight {
 *      position : vec3f,
 *      color : vec3f,
 *   };
 *    struct LightStorage {
 *       pointCount : u32,
 *       point : array<PointLight>,
 *   };
 *
 */

import { vec3 } from "gl-matrix";

export class Lights {
    buffer: GPUBuffer;

    // Light data
    max_lights: number;
    storage: PointLight[] = [];

    constructor(max_lights: number = 10) {
        // For now lets initialize with 1 light
        this.max_lights = max_lights;
    }

    public async init(device: GPUDevice) {
        // Create runtime size buffer 10 lights max for now (strange aligns see wgsl)
        const size = 16 + 32 * this.max_lights;
        const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            label: "Lights",
            size: size,
            usage: usage,
        };

        this.buffer = device.createBuffer(descriptor);

        // Write initial data
        this.writeBuffer(device);
    }
    public writeBuffer(device: GPUDevice) {
        device.queue.writeBuffer(
            this.buffer,
            0,
            new Uint32Array([this.storage.length])
        );
        for (let i = 0; i < this.storage.length; i++) {
            const light = this.storage[i];
            device.queue.writeBuffer(
                this.buffer,
                16 + i * 32,
                <ArrayBuffer>light.position
            );
            device.queue.writeBuffer(
                this.buffer,
                32 + i * 32,
                <ArrayBuffer>light.color
            );
        }
    }

    public addLight(device: GPUDevice, position: vec3, color: vec3) {
        const newLight = new PointLight(position, color);
        this.storage.push(newLight);

        // Write new data
        this.writeBuffer(device);
    }
}

export class PointLight {
    position: vec3;
    color: vec3;

    constructor(position: vec3, color: vec3) {
        this.position = position;
        this.color = color;
    }
}
