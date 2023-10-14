interface IndexAndGeneration {
    index: number,
    generation: number
}

function slice<T>(arr: T[], start: number, end: number): T[] {
    let out: T[] = [];

    for (let i = start; i < end; i++) {
        out.push(arr[i]);
    }

    return out;
}

function join<T>(arr: T[]): string {
    let out = "";

    for (let i = 0; i < arr.length; i++) {
        if (i !== 0) out += ",";
        out += "" + arr[i];
    }

    return out;
}

class GenerationManager {
    componentNumsNeeded: number;
    alignment: number;
    nextOpen: number | null;

    generations: Array<number | null | boolean>;

    constructor(componentCount: number) {
        // 32 bits is maximum binary operator precision
        this.componentNumsNeeded = math.ceil(componentCount / 32);
        this.alignment = math.max(this.componentNumsNeeded, 2) + 1;
        this.nextOpen = null;

        // [
        //                            VV pointer to next open or null
        //     generation, n1OrFalse, n2OrPointerToNext, ...
        //                 ^^ false if not taken
        // 
        //     0, 0b100010, 0b0
        //     1, false,    0
        //     1, 0b0,      0b0
        // ]
        this.generations = [];
    }

    generation(index: number): number {
        return this.generations[index * this.alignment] as number;
    }

    isTaken(index: number): boolean {
        return this.generations[index * this.alignment + 1] !== false;
    }

    pointerToNext(index: number): number | null {
        return this.generations[index * this.alignment + 2] as (number | null);
    }

    len(): number {
        return math.floor(this.generations.length / this.alignment);
    }

    getOpen(): IndexAndGeneration {
        if (this.nextOpen !== null) {
            // sanity check
            if (!this.isTaken(this.nextOpen)) {
                const index = this.nextOpen;
                const generation = this.generation(index) as number;

                this.nextOpen = this.pointerToNext(index);

                // zero out bitflags
                for (let i = 1; i < this.alignment; i++) {
                    this.generations[index * this.alignment + i] = 0;
                }

                return {
                    index,
                    generation
                };
            } else {
                throw "unreachable! this.nextOpen is corrupt";
            }
        } else {
            for (var i = 0; i < this.alignment; i++) {
                this.generations.push(0);
            }

            return {
                index: math.floor(this.generations.length / this.alignment) - 1,
                generation: 0
            };
        }
    }

    setBitflags(id: IndexAndGeneration, flags: number[]): boolean {
        if (flags.length === this.componentNumsNeeded) {
            if (!this.check(id)) return false;

            const { index } = id;

            for (let i = 0; i < flags.length; i++) {
                this.generations[index * this.alignment + 1 + i] = flags[i];
            }

            return true;
        }

        return false;
    }

    getBitflags(id: IndexAndGeneration): number[] | undefined {
        if (!this.check(id)) return undefined;

        const { index } = id;

        return slice(
            this.generations,
            index * this.alignment + 1,
            index * this.alignment + 1 + this.componentNumsNeeded
        ) as number[];
    }

    check(id: IndexAndGeneration): boolean {
        const {
            index,
            generation
        } = id;

        return this.generation(index) === generation && this.isTaken(index);
    }

    remove(id: IndexAndGeneration) {
        if (this.check(id)) {
            const { index } = id;

            // increment generation
            (this.generations[index * this.alignment] as number) += 1;

            // set taken to false
            this.generations[index * this.alignment + 1] = false;

            // set next pointer
            this.generations[index * this.alignment + 2] = this.nextOpen;
            this.nextOpen = index;

            return true;
        } else {
            return false;
        }
    }
}

export { GenerationManager, IndexAndGeneration, slice, join };