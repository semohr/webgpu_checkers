import { vec3, vec2 } from "gl-matrix";

export interface Mesh {
    buffer: GPUBuffer;
    bufferLayout: GPUVertexBufferLayout;
    num_vertices: number;

    init(device: GPUDevice): Promise<void>;
}

/** This is a simple obj loader, it only supports
 * vertices, texcoords and normals.
 */
export class ObjMesh implements Mesh {
    buffer: GPUBuffer;
    bufferLayout: GPUVertexBufferLayout;
    num_vertices: number;

    v: vec3[];
    vt: vec2[];
    vn: vec3[];
    vertices: Float32Array;
    path: string;

    constructor(path: string) {
        this.v = [];
        this.vt = [];
        this.vn = [];
        this.path = path;
    }

    public async init(device: GPUDevice) {
        const lines = await this.fetch_obj(this.path);
        var result: number[] = [];

        lines.forEach((line) => {
            //console.log(line);
            if (line[0] == "v" && line[1] == " ") {
                this.read_vertex_data(line);
            } else if (line[0] == "v" && line[1] == "t") {
                this.read_texcoord_data(line);
            } else if (line[0] == "v" && line[1] == "n") {
                this.read_normal_data(line);
            } else if (line[0] == "f") {
                this.read_face_data(line, result);
            }
        });

        // x y z u v nx ny nz
        this.vertices = new Float32Array(result);
        this.num_vertices = this.vertices.length / 8;

        const usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            label: "Obj vertices" + this.path,
            size: this.vertices.byteLength,
            usage: usage,
        };

        this.buffer = device.createBuffer(descriptor);
        device.queue.writeBuffer(
            this.buffer,
            /*bufferOffset=*/ 0,
            this.vertices
        );
        this.bufferLayout = {
            arrayStride: 32,
            attributes: [
                {
                    format: "float32x3",
                    offset: 0,
                    shaderLocation: 0,
                },
                {
                    format: "float32x2",
                    offset: 12,
                    shaderLocation: 1, // Texcoord, see vertex shader
                },
                {
                    format: "float32x3",
                    offset: 20,
                    shaderLocation: 2, // Normal, see vertex shader
                },
            ],
        };
    }

    private async fetch_obj(path: string) {
        return await fetch(path)
            .then((response) => response.blob())
            .then((blob) => blob.text())
            .then((text) => text.split("\n"));
    }

    private read_vertex_data(line: string) {
        const components = line.split(" ");
        // ["v", "x", "y", "z"]
        const new_vertex: vec3 = [
            Number(components[1]).valueOf(),
            Number(components[2]).valueOf(),
            Number(components[3]).valueOf(),
        ];

        this.v.push(new_vertex);
    }

    private read_texcoord_data(line: string) {
        const components = line.split(" ");
        // ["vt", "u", "v"]
        const new_texcoord: vec2 = [
            Number(components[1]).valueOf(),
            Number(components[2]).valueOf(),
        ];

        this.vt.push(new_texcoord);
    }

    private read_normal_data(line: string) {
        const components = line.split(" ");
        // ["vn", "nx", "ny", "nz"]
        const new_normal: vec3 = [
            Number(components[1]).valueOf(),
            Number(components[2]).valueOf(),
            Number(components[3]).valueOf(),
        ];

        this.vn.push(new_normal);
    }

    private read_face_data(line: string, result: number[]) {
        line = line.replace("\n", "");
        const vertex_descriptions = line.split(" ");
        // ["f", "v1", "v2", ...]
        /*
            triangle fan setup, eg.
            v1 v2 v3 v4 => (v1, v2, v3), (v1, v3, v4)

            no. of triangles = no. of vertices - 2
        */

        const triangle_count = vertex_descriptions.length - 3; // accounting also for "f"
        for (var i = 0; i < triangle_count; i++) {
            //corner a
            this.read_corner(vertex_descriptions[1], result);
            this.read_corner(vertex_descriptions[2 + i], result);
            this.read_corner(vertex_descriptions[3 + i], result);
        }
    }

    private read_corner(vertex_description: string, result: number[]) {
        const v_vt_vn = vertex_description.split("/");
        const v = this.v[Number(v_vt_vn[0]).valueOf() - 1];
        const vt = this.vt[Number(v_vt_vn[1]).valueOf() - 1];
        const vn = this.vn[Number(v_vt_vn[2]).valueOf() - 1];
        //ignoring normals for now
        result.push(v[0]);
        result.push(v[1]);
        result.push(v[2]);
        result.push(vt[0]);
        result.push(vt[1]);
        result.push(vn[0]);
        result.push(vn[1]);
        result.push(vn[2]);
    }
}
