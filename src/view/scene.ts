import { mat4, vec3 } from "gl-matrix";
import { ImageMaterial } from "./assets/ImageMaterial";
import { ObjMesh } from "./assets/ObjMesh";
import { Asset } from "./assets/assets";
import { Lights, PointLight } from "./assets/lights";

/** Am not too sure if traditionally this is a scene
 * in game engine terms, but for me it makes sense
 * to put all the objects / assets here.
 */
export interface Scene {
    assets: Map<string, Asset>;
    lights: Lights;

    init(device: GPUDevice): Promise<void>;
}

export class CheckerScene implements Scene {
    assets: Map<string, Asset>;
    lights: Lights;

    constructor() {
        // This scene contains a table, a chessboard and the checkers
        const sources = [
            {
                name: "table",
                src: "assets/table.obj",
                img: "assets/table.png",
                n: 1,
            },
            {
                name: "chessboard",
                src: "assets/chessboard.obj",
                img: "assets/chessboard.png",
                n: 1,
            },

            {
                name: "klingon",
                src: "assets/klingon.obj",
                img: "assets/klingon.png",
                n: 0,
            },
            {
                name: "command",
                src: "assets/command.obj",
                img: "assets/command.png",
                n: 0,
            },
            {
                name: "preview",
                src: "assets/preview.obj",
                img: "assets/preview.png",
                n: 0,
            },
        ];
        this.assets = new Map<string, Asset>();
        for (const source of sources) {
            this.assets.set(source.name, {
                mesh: new ObjMesh(source.src),
                material: new ImageMaterial(source.img, 0, true, false), // blender flips the image
                modelMatrix: Array.from({ length: source.n }, () =>
                    mat4.create()
                ),
                modelMatrixBuffer: null as any,
                highlight: [false],
                highlightBuffer: null as any,
            });
        }

        // Add lights above the table
        this.lights = new Lights();
        this.lights.storage.push(
            new PointLight(vec3.fromValues(-3, 0, 3), vec3.fromValues(1, 1, 1))
        );
        this.lights.storage.push(
            new PointLight(vec3.fromValues(3, 0, 3), vec3.fromValues(1, 1, 1))
        );
    }

    public async init(device: GPUDevice) {
        const promises = [];
        for (const [name, asset] of this.assets) {
            promises.push(asset.mesh.init(device));
            promises.push(asset.material.init(device));

            // Create model matrix buffer
            asset.modelMatrixBuffer = device.createBuffer({
                label: "Model Matrix",
                size: 64 * 12,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });

            // Create highlight buffer
            asset.highlightBuffer = device.createBuffer({
                label: "Highlight",
                size: 4 * 12,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }
        promises.push(this.lights.init(device));
        await Promise.all(promises);

        // Write all buffers
        for (const [name, asset] of this.assets) {
            for (let i = 0; i < asset.modelMatrix.length; i++) {
                device.queue.writeBuffer(
                    asset.modelMatrixBuffer,
                    i * 64,
                    <ArrayBuffer>asset.modelMatrix[i]
                );
            }

            // binary to decimal
            const array = new Uint32Array(asset.highlight as []);

            // Convert hightlight to int and write
            device.queue.writeBuffer(asset.highlightBuffer, 0, array);
        }
    }
}
