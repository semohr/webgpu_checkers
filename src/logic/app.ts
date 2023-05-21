import { mat4, vec3 } from "gl-matrix";
import { Renderer } from "../view/renderer";
import { Camera } from "./camera";
import { CheckerScene, Scene } from "../view/scene";
import { CellState, CheckersBoard } from "./checkersBoard";
import { Asset } from "src/view/assets/assets";

export class App {
    // Objects
    canvas: HTMLCanvasElement;
    camera: Camera;
    renderer: Renderer;
    scene: Scene;
    gameboard: CheckersBoard;

    // State
    _active_piece: {
        piece: "command" | "klingon";
        instance: number;
        position: [number, number];
        next_valid_moves: [number, number][];
    } | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.scene = new CheckerScene();
        this.camera = new Camera();
        this.gameboard = new CheckersBoard();

        this.renderer = new Renderer(this.canvas, this.scene, this.camera);

        this.register_handlers();
    }

    public async init() {
        // Resize canvas to match parent
        const cr = this.canvas.parentElement!.getBoundingClientRect();
        this.canvas.width = cr.width;
        this.canvas.height = cr.height;

        // Init renderer
        await this.renderer.init();

        // Set camera to center of board
        this.camera.set_position(vec3.fromValues(-2, 0, 6));
        this.camera.set_look_at(vec3.fromValues(0, 0, 3.4));
        // Write camera data to buffer
        this.camera.writeBuffer(this.renderer.device);

        // Called once to setup the piece instances
        this.gameboard.update(
            this.renderer.device,
            this.scene.assets.get("klingon") as Asset,
            this.scene.assets.get("command") as Asset
        );
    }

    public run() {
        var running = true;
        this.renderer.render(); // Render scene
        if (running) {
            requestAnimationFrame(this.run.bind(this));
        }
    }

    private register_handlers() {
        document.addEventListener("keydown", (e) => {
            this.handle_keydown(e);
        });
        document.addEventListener("keyup", (e) => {
            this.handle_keyup(e);
        });

        document.addEventListener("wheel", (e) => {
            this.handle_mousewheel(e as WheelEvent);
        });

        // Mouse move camera on left click and drag
        this.canvas.addEventListener("mousedown", (e) => {
            this.handle_mousedown(e);
        });
        this.canvas.addEventListener("mouseup", (e) => {
            this.handle_mouseup(e);
        });
        this.canvas.addEventListener("mousemove", (e) => {
            this.handle_mousemove(e);
        });
        this.canvas.addEventListener("wheel", (e) => {
            this.handle_mousewheel(e as WheelEvent);
        });
        this.canvas.addEventListener("click", (e) => {
            this.handle_click(e);
        });
        this.canvas.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        // ResizeObserver for canvas parent

        const cb = debounce((entries: ResizeObserverEntry[]) => {
            for (let entry of entries) {
                // Get parent dimensions
                const cr = entry.contentRect;
                this.renderer.resize(cr.width, cr.height);
            }
        }, 100);

        const observer = new ResizeObserver(cb);
        observer.observe(this.canvas!.parentElement!);
    }

    private handle_keydown(e: KeyboardEvent) {
        switch (e.key) {
            case "w":
                this.camera.position[2] += 0.1;
                this.camera.set_position(this.camera.position);
                this.camera.writeBuffer(this.renderer.device);
                break;
            case "a":
                this.camera.position[1] -= 0.1;
                this.camera.set_position(this.camera.position);
                this.camera.writeBuffer(this.renderer.device);
                break;
            case "s":
                this.camera.position[2] -= 0.1;
                this.camera.set_position(this.camera.position);
                this.camera.writeBuffer(this.renderer.device);

                break;
            case "d":
                this.camera.position[1] += 0.1;
                this.camera.set_position(this.camera.position);
                this.camera.writeBuffer(this.renderer.device);
                break;
            default:
                break;
        }
    }

    private handle_keyup(e: KeyboardEvent) {}

    private handle_mousedown(e: MouseEvent) {
        if (e.button == 1 || e.button == 2) {
            e.preventDefault();
            e.stopPropagation();
            // Left click
            this.camera.mouse_down = true;
        }
    }
    private handle_mouseup(e: MouseEvent) {
        if (e.button == 1 || e.button == 2) {
            e.preventDefault();
            e.stopPropagation();
            // Left click
            this.camera.mouse_down = false;
        }
    }

    private handle_mousemove(e: MouseEvent) {
        if (this.camera.mouse_down) {
            // Get relative mouse position to canvas
            const x = e.clientX - this.canvas.offsetLeft;
            const y = e.clientY - this.canvas.offsetTop;

            // Get relative mouse movement
            const dx = x - this.camera.mouse_x;
            const dy = y - this.camera.mouse_y;

            // Update camera
            this.camera.position[0] += dy * 0.01;
            this.camera.position[1] -= dx * 0.01;
            this.camera.set_position(this.camera.position);
            this.camera.writeBuffer(this.renderer.device);
        }

        // Update mouse position
        this.camera.mouse_x = e.clientX - this.canvas.offsetLeft;
        this.camera.mouse_y = e.clientY - this.canvas.offsetTop;
    }

    private handle_mousewheel(e: WheelEvent) {
        console.log(e);
    }

    getObjectIDPending = false;
    private async handle_click(e: MouseEvent) {
        // Get relative mouse position to canvas
        if (this.getObjectIDPending) {
            return;
        }
        const x = e.clientX - this.canvas.offsetLeft;
        const y = e.clientY - this.canvas.offsetTop;

        // Get object ID from renderer (clicked on object)
        this.getObjectIDPending = true;
        const [instanceID, MeshID] = await this.renderer.getObjectID(x, y);
        this.getObjectIDPending = false;

        // Set active piece
        switch (MeshID) {
            case 3:
                this.active_piece = {
                    piece: "klingon",
                    instance: instanceID,
                };
                break;
            case 4:
                this.active_piece = {
                    piece: "command",
                    instance: instanceID,
                };
                break;
            case 5:
                // Clicked on a valid move
                if (!this._active_piece) return;
                const [x, y] = this._active_piece.next_valid_moves[instanceID];
                this.gameboard.movePiece(
                    this._active_piece.position[0],
                    this._active_piece.position[1],
                    x,
                    y
                );
                this.gameboard.update(
                    this.renderer.device,
                    this.scene.assets.get("klingon") as Asset,
                    this.scene.assets.get("command") as Asset
                );
                this.removePreview();
                this.active_piece = null;
                break;

            default:
                console.log("Clicked on empty space");
                console.log(instanceID, MeshID);
                return;
        }
    }

    private removePreview() {
        const previews = this.scene.assets.get("preview") as Asset;
        previews.modelMatrix = [];
        const a = new Float32Array(previews.modelMatrix as []);
        this.renderer.device.queue.writeBuffer(
            previews.modelMatrixBuffer,
            0,
            a
        );
    }

    private set active_piece(
        piece: {
            piece: "command" | "klingon";
            instance: number;
        } | null
    ) {
        // Unset previous highlighted piece
        if (this._active_piece) {
            const asset = this.scene.assets.get(
                this._active_piece.piece
            ) as Asset;

            asset.highlight.fill(false);
            const array = new Uint32Array(asset.highlight as []);
            this.renderer.device.queue.writeBuffer(
                asset.highlightBuffer,
                0,
                array
            );
        }
        // Unset previous previews for valid moves
        this.removePreview();
        if (!piece) {
            this._active_piece = null;
            return;
        }

        // Update highlight buffer
        const asset = this.scene.assets.get(piece.piece) as Asset;
        asset.highlight.fill(false);
        asset.highlight[piece.instance] = true;
        const array = new Uint32Array(asset.highlight as []);
        this.renderer.device.queue.writeBuffer(asset.highlightBuffer, 0, array);

        // Update previews
        const cellstate =
            piece.piece == "klingon" ? CellState.Klingon : CellState.Command;
        const position = this.gameboard.get_xy_from_instance(
            cellstate,
            piece.instance
        );
        if (!position) {
            return;
        }
        const moves = this.gameboard.getValidMoves(position[0], position[1]);
        const previews = this.scene.assets.get("preview") as Asset;
        moves.forEach((move, i) => {
            const mat = mat4.create();
            mat4.translate(mat, mat, [0.235 * move[1], -0.235 * move[0], 0]);
            previews.modelMatrix.push(mat);
            this.renderer.device.queue.writeBuffer(
                previews.modelMatrixBuffer,
                i * 64,
                <ArrayBuffer>previews.modelMatrix[i]
            );
        });

        // Set active piece
        this._active_piece = {
            piece: piece.piece,
            instance: piece.instance,
            position: position,
            next_valid_moves: moves as [number, number][],
        };
    }
}

function debounce(func: Function, timeout = 300) {
    let timer: any;
    return (...args: any) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            // @ts-ignore
            func.apply(this, args);
        }, timeout);
    };
}
