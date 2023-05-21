import { mat4 } from "gl-matrix";
import { Asset } from "src/view/assets/assets";

export enum CellState {
    Empty = 0,
    Klingon = 1, // Player 1
    Command = 2, // Player 2
}

export class CheckersBoard {
    width: number = 8;
    height: number = 8;
    cells: Array<CellState>;

    constructor() {
        this.cells = new Array<CellState>(this.width * this.height);

        // Init cells
        this.cells.fill(CellState.Empty);

        // Fill the board
        // x o x o x o x o
        // o x o x o x o x
        // ...
        for (let i = 0; i < this.cells.length; i++) {
            const [x, y] = this.get_xy(i);
            if (x % 2 == y % 2) {
                if (y < 3) {
                    this.cells[i] = CellState.Klingon;
                } else if (y > 4) {
                    this.cells[i] = CellState.Command;
                }
            }
        }

        console.log(this.cells);
    }

    public update(device: GPUDevice, klingon: Asset, command: Asset) {
        // Write model matrices
        // Coords -> models start at 0,0 (bottom left)
        // One square is  one square is 0.235x0.235

        // Get position of all klingons
        [klingon, command].forEach((asset, i) => {
            const positions = this.cells
                .map((cell, index) => {
                    if (cell == i + 1) {
                        return this.get_xy(index);
                    }
                    return undefined;
                })
                .filter((pos) => pos != undefined);

            // If length changes overwrite buffer else just update
            if (positions.length != asset.modelMatrix.length) {
                // Remove if too long
                if (positions.length < asset.modelMatrix.length) {
                    asset.modelMatrix.splice(positions.length);
                }
                // Add if too short
                else {
                    for (
                        let j = asset.modelMatrix.length;
                        j < positions.length;
                        j++
                    ) {
                        asset.modelMatrix.push(mat4.create());
                    }
                }
            }

            // Update model matrices
            positions.forEach((pos, i) => {
                const [x, y] = pos as [number, number];
                mat4.fromTranslation(asset.modelMatrix[i], [
                    0.235 * y,
                    -0.235 * x,
                    0,
                ]);

                device.queue.writeBuffer(
                    asset.modelMatrixBuffer,
                    i * 64,
                    <ArrayBuffer>asset.modelMatrix[i]
                );
            });
        });
    }

    get_index(x: number, y: number): number {
        return this.width * y + x;
    }
    num_state(player: CellState): number {
        return this.cells.filter((cell) => cell == player).length;
    }
    get_xy(index: number): [number, number] {
        return [index % this.width, Math.floor(index / this.width)];
    }

    get_xy_from_instance(
        piece: CellState,
        instance: number
    ): [number, number] | undefined {
        // Get instance occupied cell of type piece
        let found = 0;
        for (let i = 0; i < this.cells.length; i++) {
            if (this.cells[i] == piece) {
                if (found == instance) {
                    return this.get_xy(i);
                }
                found++;
            }
        }
        return undefined;
    }

    getValidMoves(x: number, y: number): Array<number[]> {
        // Check if x,y is a valid piece
        const moves: Array<number[]> = [];
        const state = this.cells[this.get_index(x, y)];
        if (state != CellState.Klingon && state != CellState.Command) {
            return moves;
        }

        // Determine direction of movement
        const direction = state == CellState.Klingon ? 1 : -1;

        // Create a list of all possible moves

        const out_of_bounds = (x: number, y: number) => {
            return x < 0 || y < 0 || x >= this.width || y >= this.height;
        };

        // 1. Regular moves (diagonal no jump)
        const reg_moves = [
            [x - 1, y + direction],
            [x + 1, y + direction],
        ];
        moves.push(
            ...reg_moves.filter((move) => {
                const [x, y] = move;
                if (out_of_bounds(x, y)) return false;
                if (this.cells[this.get_index(x, y)] != CellState.Empty)
                    return false;
                return true;
            })
        );

        // 2. Jump moves (diagonal jump)
        const jump_moves = [
            [x - 2, y + direction * 2],
            [x + 2, y + direction * 2],
        ];

        moves.push(
            ...jump_moves.filter((move) => {
                const [x_, y_] = move;
                // Check if move is in bounds
                if (out_of_bounds(x_, y_)) return false;
                // Check if move is empty
                if (this.cells[this.get_index(x_, y_)] != CellState.Empty)
                    return false;
                // Check if enemy is in between
                const enemy = state == CellState.Klingon ? 2 : 1;
                const enemy_x = (x + x_) / 2;
                const enemy_y = (y + y_) / 2;
                if (this.cells[this.get_index(enemy_x, enemy_y)] != enemy)
                    return false;

                return true;
            })
        );
        return moves;
    }

    movePiece(fromX: number, fromY: number, toX: number, toY: number): void {
        // No validation here
        const fromIndex = this.get_index(fromX, fromY);
        const toIndex = this.get_index(toX, toY);

        // Move piece
        this.cells[toIndex] = this.cells[fromIndex];
        this.cells[fromIndex] = CellState.Empty;

        // Check if piece is captured
        const enemy = this.cells[toIndex] == CellState.Klingon ? 2 : 1;
        const enemy_x = (fromX + toX) / 2;
        const enemy_y = (fromY + toY) / 2;
        const enemy_index = this.get_index(enemy_x, enemy_y);
        if (this.cells[enemy_index] == enemy) {
            this.cells[enemy_index] = CellState.Empty;
        }
    }
}
