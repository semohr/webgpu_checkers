import shaderCode from "./shaders/shaders.wgsl";
import shaderCodePick from "./shaders/shaders_pick.wgsl";

import { Camera } from "src/logic/camera";

import { Scene } from "./scene";

export class Renderer {
    canvas: HTMLCanvasElement;
    scene: Scene;
    camera: Camera;

    // GPU context
    device: GPUDevice;
    context: GPUCanvasContext;
    adapter: GPUAdapter;
    format: GPUTextureFormat;

    // Render pipeline
    pipeline: GPURenderPipeline;

    // Picking pipeline
    pickPipeline: GPURenderPipeline;
    pickUniformBuffer: GPUBuffer;
    pickBindGroupLayout: GPUBindGroupLayout;
    pickBindGroups: Map<string, GPUBindGroup>;
    pickMapReadBuffer: GPUBuffer;

    // Depth
    depthStencilState: GPUDepthStencilState;
    depthStencilBuffer: GPUTexture;
    depthStencilView: GPUTextureView;
    depthStencilAttachment: GPURenderPassDepthStencilAttachment;

    // Assets
    assetBindGroupLayout: GPUBindGroupLayout; // Layout is the same for all meshes/materials
    assetBindGroups: Map<string, GPUBindGroup>; // One bind group per asset

    // Camera
    cameraBindGroupLayout: GPUBindGroupLayout;
    cameraBindGroup: GPUBindGroup;

    // Lighting
    lightsBindGroupLayout: GPUBindGroupLayout;
    lightsBindGroup: GPUBindGroup;
    timeBuffer: GPUBuffer;

    constructor(
        canvas: HTMLCanvasElement,
        initialScene: Scene,
        initialCamera: Camera
    ) {
        this.canvas = canvas;
        this.scene = initialScene;
        this.camera = initialCamera;
        this.assetBindGroups = new Map<string, GPUBindGroup>();
        this.pickBindGroups = new Map<string, GPUBindGroup>();
    }

    public async init() {
        // Setup the device and gpu context
        await this.setupWebgpu();

        // Create bind group layouts
        await this.createBindGroupLayouts();

        // Init scene assets
        await this.scene.init(this.device);
        await this.camera.init(this.device, this.canvas);

        await this.createDepthBufferResources();

        // Create bind groups
        await this.createBindGroups();

        // Create render pipeline
        await this.createRenderPipeline();
    }

    public async render() {
        // Early exit
        if (!this.device || !this.pipeline) {
            return;
        }

        this.device.queue.writeBuffer(
            this.timeBuffer,
            0,
            new Float32Array([performance.now() / 1000])
        );

        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.context.getCurrentTexture().createView(),
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    storeOp: "store",
                    loadOp: "clear",
                },
            ],
            depthStencilAttachment: this.depthStencilAttachment,
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.lightsBindGroup); // @group(0)
        renderPass.setBindGroup(1, this.cameraBindGroup); // @group(1)

        // Draw scene assets
        for (const [name, asset] of this.scene.assets) {
            const num_instances = asset.modelMatrix.length;
            renderPass.setBindGroup(
                2,
                this.assetBindGroups.get(name) as GPUBindGroup
            ); // @group(2)
            renderPass.setVertexBuffer(0, asset.mesh.buffer);
            renderPass.draw(asset.mesh.num_vertices, num_instances);
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    public async getObjectID(pixelX: number, pixelY: number) {
        const pickInstanceTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height, 1],
            format: "r32uint",
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const pickIDTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height, 1],
            format: "r32uint",
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        const pickDepthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height, 1],
            format: "depth24plus",
            usage: GPUTextureUsage.COPY_SRC | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [
                {
                    view: pickInstanceTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
                {
                    view: pickIDTexture.createView(),
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
            depthStencilAttachment: {
                view: pickDepthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        passEncoder.setPipeline(this.pickPipeline);
        passEncoder.setBindGroup(0, this.cameraBindGroup); // @group(1)

        for (const [name, asset] of this.scene.assets) {
            const num_instances = asset.modelMatrix.length;
            passEncoder.setBindGroup(
                1,
                this.pickBindGroups.get(name) as GPUBindGroup
            ); // @group(1)
            passEncoder.setVertexBuffer(0, asset.mesh.buffer);
            passEncoder.draw(asset.mesh.num_vertices, num_instances);
        }
        passEncoder.end();
        commandEncoder.copyTextureToBuffer(
            {
                mipLevel: 0,
                texture: pickInstanceTexture,
                origin: { x: pixelX, y: pixelY },
            },
            {
                buffer: this.pickMapReadBuffer,
                bytesPerRow: ((4 + 255) | 0) * 256,
                rowsPerImage: 1,
            },
            {
                width: 1,
            }
        );
        commandEncoder.copyTextureToBuffer(
            {
                mipLevel: 0,
                texture: pickIDTexture,
                origin: { x: pixelX, y: pixelY },
            },
            {
                buffer: this.pickMapReadBuffer,
                bytesPerRow: ((4 + 255) | 0) * 256,
                rowsPerImage: 1,
                offset: 4,
            },
            {
                width: 1,
            }
        );

        this.device.queue.submit([commandEncoder.finish()]);
        await this.pickMapReadBuffer.mapAsync(GPUMapMode.READ, 0, 8);
        const pickedId = new Uint32Array(
            this.pickMapReadBuffer.getMappedRange(0, 8)
        );
        const pickedInstance = pickedId[0];
        const pickedMesh = pickedId[1];
        this.pickMapReadBuffer.unmap();
        return [pickedInstance, pickedMesh] as [number, number];
    }

    public async resize(width: number, height: number) {
        if (!this.device || !this.pipeline) {
            return;
        }
        const ratio = window.devicePixelRatio || 1;
        this.canvas.width = width * ratio;
        this.canvas.height = height * ratio;

        this.camera.canvas_resize(this.device, this.canvas);

        await this.createDepthBufferResources();
    }

    private async setupWebgpu() {
        if (!navigator.gpu) throw new Error("WebGPU not supported");

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw Error("Couldn't request WebGPU adapter.");
        this.adapter = adapter;

        this.device = await this.adapter.requestDevice();
        if (!this.device) throw Error("Couldn't request WebGPU device.");

        const context = this.canvas.getContext("webgpu");
        if (!context) throw Error("Couldn't get WebGPU context.");
        this.context = context;
        this.format = "bgra8unorm";
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: "opaque",
        });
    }

    private async createBindGroupLayouts() {
        // Create lights bind group
        this.lightsBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
                    buffer: {
                        type: "uniform",
                    },
                },
            ],
        });

        // Create asset bind group
        this.assetBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    //sampler
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {},
                },
                {
                    //texture view
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {},
                },
                {
                    //uniform buffer (instance model matrix)
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
                {
                    //uniform buffer (highlight)
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
            ],
        });

        // Create camera bind group
        this.cameraBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                    },
                },
            ],
        });

        // Create pick bind group
        this.pickBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: "uniform",
                    },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                    },
                },
            ],
        });
    }

    public async createDepthBufferResources() {
        if (this.depthStencilState == undefined) {
            this.depthStencilState = {
                format: "depth24plus-stencil8",
                depthWriteEnabled: true,
                depthCompare: "less-equal",
            };
        }

        const depthBufferDescriptor: GPUTextureDescriptor = {
            size: {
                width: this.canvas.width,
                height: this.canvas.height,
                depthOrArrayLayers: 1,
            },
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        };
        this.depthStencilBuffer = this.device!.createTexture(
            depthBufferDescriptor
        );

        const viewDescriptor: GPUTextureViewDescriptor = {
            format: "depth24plus-stencil8",
            dimension: "2d",
            aspect: "all",
        };
        this.depthStencilView =
            this.depthStencilBuffer.createView(viewDescriptor);

        this.depthStencilAttachment = {
            view: this.depthStencilView,
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",

            stencilLoadOp: "clear",
            stencilStoreOp: "discard",
        };
    }

    private async createBindGroups() {
        // Create bind group for the lights

        this.timeBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.lightsBindGroup = this.device.createBindGroup({
            layout: this.lightsBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.scene.lights.buffer,
                    },
                },
                {
                    binding: 1,
                    resource: {
                        buffer: this.timeBuffer,
                    },
                },
            ],
        });

        // Create a bind group for the scene assets
        for (const [name, asset] of this.scene.assets) {
            const bindGroup = this.device.createBindGroup({
                layout: this.assetBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: asset.material.sampler,
                    },
                    {
                        binding: 1,
                        resource: asset.material.textureView,
                    },
                    {
                        binding: 2,
                        resource: {
                            buffer: asset.modelMatrixBuffer,
                        },
                    },
                    {
                        binding: 3,
                        resource: {
                            buffer: asset.highlightBuffer,
                        },
                    },
                ],
            });
            this.assetBindGroups.set(name, bindGroup);
        }

        // Create camera bind group
        this.cameraBindGroup = this.device.createBindGroup({
            layout: this.cameraBindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.camera.buffer,
                    },
                },
            ],
        });

        // Create pick bind group
        let i = 1; // 0 is reserved for the background
        for (const [name, asset] of this.scene.assets) {
            const pickUniformBuffer = this.device.createBuffer({
                size: 4, // 4 bytes uint32
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.device.queue.writeBuffer(
                pickUniformBuffer,
                0,
                new Uint32Array([i])
            );
            const pickBindGroup = this.device.createBindGroup({
                layout: this.pickBindGroupLayout,
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: pickUniformBuffer,
                        },
                    },
                    {
                        binding: 1,
                        resource: {
                            buffer: asset.modelMatrixBuffer,
                        },
                    },
                ],
            });
            this.pickBindGroups.set(name, pickBindGroup);
            i++;
        }
        this.pickMapReadBuffer = this.device.createBuffer({
            size: 8, // 4 bytes uint32 * 2
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    private async createRenderPipeline() {
        // Create shader module
        const shaderModule = this.device.createShaderModule({
            label: "RenderShaderModule",
            code: shaderCode,
        });

        // Create render pipeline layout
        const layout = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.lightsBindGroupLayout,
                this.cameraBindGroupLayout,
                this.assetBindGroupLayout,
            ],
        });

        // Create render pipeline
        this.pipeline = this.device.createRenderPipeline({
            label: "renderPipeline",
            layout: layout,
            depthStencil: this.depthStencilState,
            vertex: {
                module: shaderModule,
                entryPoint: "vertexMain",
                buffers: [
                    {
                        arrayStride: 32,
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            },
                            {
                                // texture coordinates
                                shaderLocation: 1,
                                offset: 12,
                                format: "float32x2",
                            },
                            {
                                // normal
                                shaderLocation: 2,
                                offset: 20,
                                format: "float32x3",
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: shaderModule,
                entryPoint: "fragmentMain",
                targets: [
                    {
                        format: this.format,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
        });
        const shaderCodeModule = this.device.createShaderModule({
            label: "PickShaderModule",
            code: shaderCodePick,
        });
        const layoutPick = this.device.createPipelineLayout({
            bindGroupLayouts: [
                this.cameraBindGroupLayout,
                this.pickBindGroupLayout,
            ],
        });

        // Create pipeline layout
        this.pickPipeline = this.device.createRenderPipeline({
            label: "PickerPipeline",
            layout: layoutPick,
            vertex: {
                module: shaderCodeModule,
                entryPoint: "pickingVertexMain",
                buffers: [
                    {
                        arrayStride: 32,
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x3",
                            },
                            {
                                // texture coordinates
                                shaderLocation: 1,
                                offset: 12,
                                format: "float32x2",
                            },
                            {
                                // normal
                                shaderLocation: 2,
                                offset: 20,
                                format: "float32x3",
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: shaderCodeModule,
                entryPoint: "pickingFragmentMain",
                targets: [{ format: "r32uint" }, { format: "r32uint" }],
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "back",
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: "less",
                format: "depth24plus",
            },
        });
    }
}
