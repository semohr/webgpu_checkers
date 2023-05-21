import { mat4 } from "gl-matrix";
import { Mesh } from "./ObjMesh";
import { Material } from "./ImageMaterial";

export interface Asset {
    mesh: Mesh;
    material: Material;

    // The model matrix is the transformation matrix
    // that transforms the mesh from its local space
    // to the world space.
    modelMatrix: mat4[];
    modelMatrixBuffer: GPUBuffer;

    // The highlight buffer is a buffer that
    // contains a boolean for each instance of the mesh.
    highlight: boolean[];
    highlightBuffer: GPUBuffer;
}
