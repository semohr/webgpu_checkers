export interface Material {
    texture: GPUTexture;
    textureView: GPUTextureView;
    sampler: GPUSampler;

    init(device: GPUDevice): Promise<void>;
}

/** A material that is loaded from an image file.
 */
export class ImageMaterial implements Material {
    texture: GPUTexture;
    textureView: GPUTextureView;
    sampler: GPUSampler;

    path: string;
    rotation: number;
    verticalFlip: boolean;
    horizontalFlip: boolean;

    constructor(
        path: string,
        rotation: number = 0,
        verticalFlip: boolean = false,
        horizontalFlip: boolean = false
    ) {
        this.path = path;
        this.rotation = rotation;
        this.verticalFlip = verticalFlip;
        this.horizontalFlip = horizontalFlip;
    }

    async init(device: GPUDevice) {
        var imageData = await fetch(this.path)
            .then(async (response) => {
                return await response.blob();
            })
            .then(async (blob) => {
                return await createImageBitmap(blob);
            });

        // Apply rotation
        if (this.rotation != 0) {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d")!;
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((this.rotation * Math.PI) / 180);
            ctx.drawImage(
                imageData,
                -imageData.width / 2,
                -imageData.height / 2
            );
            imageData = await createImageBitmap(canvas);
        }

        // Apply flips
        if (this.verticalFlip || this.horizontalFlip) {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d")!;
            canvas.width = imageData.width;
            canvas.height = imageData.height;
            if (this.verticalFlip) {
                ctx.translate(0, canvas.height);
                ctx.scale(1, -1);
            }
            if (this.horizontalFlip) {
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
            }
            ctx.drawImage(imageData, 0, 0);
            imageData = await createImageBitmap(canvas);
        }

        await this.loadImageBitmap(device, imageData);

        const viewDescriptor: GPUTextureViewDescriptor = {
            format: "rgba8unorm",
            dimension: "2d",
            aspect: "all",
            baseMipLevel: 0,
            mipLevelCount: 1,
            baseArrayLayer: 0,
            arrayLayerCount: 1,
        };
        this.textureView = this.texture.createView(viewDescriptor);

        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1,
        };
        this.sampler = device.createSampler(samplerDescriptor);
    }

    private async loadImageBitmap(device: GPUDevice, imageData: ImageBitmap) {
        const textureDescriptor: GPUTextureDescriptor = {
            size: [imageData.width, imageData.height],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        };
        this.texture = device.createTexture(textureDescriptor);

        device.queue.copyExternalImageToTexture(
            { source: imageData },
            { texture: this.texture },
            textureDescriptor.size
        );
    }
}
