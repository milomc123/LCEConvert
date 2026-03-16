import { align4k, i24be, i24le, readUtf16BeNullTerminated, u16be, u32be, u8 } from './bytes';

export type StfsMeta = {
  headerSize: number;
  displayName: string;
  vd: {
    size: number;
    blockSeparation: number;
    fileTableBlockCount: number;
    fileTableBlockNum: number;
    allocBlockCount: number;
    unallocatedBlockCount: number;
  };
};

type HashEntry = { status: number; nextBlock: number };

type FileEntry = {
  entryIndex: number;
  name: string;
  nameLen: number;
  flags: number;
  blocksForFile: number;
  startingBlockNum: number;
  pathIndicator: number;
  fileSize: number;
};

export class StfsPackage {
  readonly data: Uint8Array;
  readonly meta: { headerSize: number; displayName: string; stfs: StfsMeta['vd'] };
  private readonly packageSex: number;
  private readonly blockStep0: number;
  private readonly blockStep1: number;
  private readonly firstHashTableAddress: number;
  private readonly topLevel: number;
  private readonly topTableEntries: HashEntry[];
  private readonly entries: FileEntry[];

  constructor(data: Uint8Array) {
    this.data = data;
    const meta = this.readHeader();
    this.meta = { headerSize: meta.headerSize, displayName: meta.displayName, stfs: meta.vd };

    this.packageSex = (~meta.vd.blockSeparation) & 1;
    if (this.packageSex === 0) {
      this.blockStep0 = 0xab;
      this.blockStep1 = 0x718f;
    } else {
      this.blockStep0 = 0xac;
      this.blockStep1 = 0x723a;
    }

    this.firstHashTableAddress = align4k(meta.headerSize);
    this.topLevel = StfsPackage.calculateTopLevel(meta.vd.allocBlockCount);
    this.topTableEntries = this.readTopTableEntries();
    this.entries = this.readFileTableEntries();
  }

  private readHeader(): StfsMeta {
    const b = this.data;
    if (b.length < 0x3b0) throw new Error('Input too small to be an STFS package');
    const headerSize = u32be(b, 0x340);
    const contentType = u32be(b, 0x344);
    if (contentType !== 1) throw new Error(`Not a savegame STFS package (content_type=${contentType})`);
    const fsMagic = u32be(b, 0x3a9);
    if (fsMagic !== 0) throw new Error('Package is not STFS format (unexpected filesystem field)');

    const size = u8(b, 0x379);
    const blockSeparation = u8(b, 0x37b);
    // file_table_block_count is little-endian u16 at 0x37C
    const fileTableBlockCount = b[0x37c] | (b[0x37d] << 8);
    const fileTableBlockNum = i24le(b, 0x37e);
    const allocBlockCount = u32be(b, 0x395);
    const unallocatedBlockCount = u32be(b, 0x399);
    const displayName = readUtf16BeNullTerminated(b, 0x411);

    return {
      headerSize,
      displayName,
      vd: {
        size,
        blockSeparation,
        fileTableBlockCount,
        fileTableBlockNum,
        allocBlockCount,
        unallocatedBlockCount,
      },
    };
  }

  static calculateTopLevel(allocBlocks: number): number {
    if (allocBlocks <= 0xaa) return 0;
    if (allocBlocks <= 0x70e4) return 1;
    if (allocBlocks <= 0x4af768) return 2;
    throw new Error('Invalid STFS alloc block count');
  }

  private computeBackingDataBlockNumber(blockNum: number): number {
    const toReturn = (((blockNum + 0xaa) / 0xaa) | 0) * (1 << this.packageSex) + blockNum;
    if (blockNum < 0xaa) return toReturn;
    if (blockNum < 0x70e4) return toReturn + ((((blockNum + 0x70e4) / 0x70e4) | 0) * (1 << this.packageSex));
    return (1 << this.packageSex) + (toReturn + ((((blockNum + 0x70e4) / 0x70e4) | 0) * (1 << this.packageSex)));
  }

  private blockToAddress(blockNum: number): number {
    return (this.computeBackingDataBlockNumber(blockNum) << 12) + this.firstHashTableAddress;
  }

  private computeLevel0BackingHashBlockNumber(blockNum: number): number {
    if (blockNum < 0xaa) return 0;
    let num = ((blockNum / 0xaa) | 0) * this.blockStep0;
    num += (((blockNum / 0x70e4) | 0) + 1) << this.packageSex;
    if (((blockNum / 0x70e4) | 0) === 0) return num;
    return num + (1 << this.packageSex);
  }

  private computeLevel1BackingHashBlockNumber(blockNum: number): number {
    if (blockNum < 0x70e4) return this.blockStep0;
    return (1 << this.packageSex) + ((blockNum / 0x70e4) | 0) * this.blockStep1;
  }

  private computeLevel2BackingHashBlockNumber(): number {
    return this.blockStep1;
  }

  private computeLevelNBackingHashBlockNumber(blockNum: number, level: number): number {
    if (level === 0) return this.computeLevel0BackingHashBlockNumber(blockNum);
    if (level === 1) return this.computeLevel1BackingHashBlockNumber(blockNum);
    if (level === 2) return this.computeLevel2BackingHashBlockNumber();
    throw new Error('Invalid STFS level');
  }

  private topTableTrueBlockNumber(): number {
    return this.computeLevelNBackingHashBlockNumber(0, this.topLevel);
  }

  private readTopTableEntries(): HashEntry[] {
    const b = this.data;
    const trueBlock = this.topTableTrueBlockNumber();
    const baseAddress = (trueBlock << 12) + this.firstHashTableAddress;
    const addressInFile = baseAddress + ((this.meta.stfs.blockSeparation & 2) << 11);

    const dataBlocksPerLevel = [1, 0xaa, 0x70e4];
    const denom = dataBlocksPerLevel[this.topLevel];

    let entryCount = (this.meta.stfs.allocBlockCount / denom) | 0;
    if (this.meta.stfs.allocBlockCount > 0x70e4 && this.meta.stfs.allocBlockCount % 0x70e4 !== 0) entryCount += 1;
    else if (this.meta.stfs.allocBlockCount > 0xaa && this.meta.stfs.allocBlockCount % 0xaa !== 0) entryCount += 1;

    const entries: HashEntry[] = [];
    let off = addressInFile;
    for (let i = 0; i < entryCount; i++) {
      const status = b[off + 0x14];
      const nextBlock = i24be(b, off + 0x15);
      entries.push({ status, nextBlock });
      off += 0x18;
    }
    return entries;
  }

  private getHashAddressOfBlock(blockNum: number): number {
    if (blockNum >= this.meta.stfs.allocBlockCount) throw new Error('Illegal STFS block');
    let hashAddr = (this.computeLevel0BackingHashBlockNumber(blockNum) << 12) + this.firstHashTableAddress;
    hashAddr += (blockNum % 0xaa) * 0x18;

    if (this.topLevel === 0) {
      hashAddr += ((this.meta.stfs.blockSeparation & 2) << 11);
    } else if (this.topLevel === 1) {
      hashAddr += ((this.topTableEntries[(blockNum / 0xaa) | 0].status & 0x40) << 6);
    } else if (this.topLevel === 2) {
      const level1Off = ((this.topTableEntries[(blockNum / 0x70e4) | 0].status & 0x40) << 6);
      const pos =
        (this.computeLevel1BackingHashBlockNumber(blockNum) << 12) +
        this.firstHashTableAddress +
        level1Off +
        ((blockNum % 0xaa) * 0x18);
      const lvl0Status = this.data[pos + 0x14];
      hashAddr += (lvl0Status & 0x40) << 6;
    } else {
      throw new Error('Unsupported top level');
    }
    return hashAddr;
  }

  private getBlockHashEntry(blockNum: number): HashEntry {
    const addr = this.getHashAddressOfBlock(blockNum);
    const status = this.data[addr + 0x14];
    const nextBlock = i24be(this.data, addr + 0x15);
    return { status, nextBlock };
  }

  private readFileTableEntries(): FileEntry[] {
    const vd = this.meta.stfs;
    const entries: FileEntry[] = [];
    let block = vd.fileTableBlockNum;
    for (let x = 0; x < vd.fileTableBlockCount; x++) {
      const currentAddr = this.blockToAddress(block);
      for (let i = 0; i < 0x40; i++) {
        const entryOff = currentAddr + i * 0x40;
        const nameRaw = this.data.subarray(entryOff, entryOff + 0x28);
        let end = nameRaw.indexOf(0);
        if (end < 0) end = nameRaw.length;
        const name = new TextDecoder('ascii', { fatal: false }).decode(nameRaw.subarray(0, end));
        const nameLenByte = this.data[entryOff + 0x28];

        if ((nameLenByte & 0x3f) === 0) continue;
        if (!name) break;

        const flags = nameLenByte >> 6;
        const nameLen = nameLenByte & 0x3f;
        const blocksForFile = i24le(this.data, entryOff + 0x29);
        const startingBlockNum = i24le(this.data, entryOff + 0x2f);
        const pathIndicator = u16be(this.data, entryOff + 0x32);
        const fileSize = u32be(this.data, entryOff + 0x34);

        entries.push({
          entryIndex: x * 0x40 + i,
          name,
          nameLen,
          flags,
          blocksForFile,
          startingBlockNum,
          pathIndicator,
          fileSize,
        });
      }
      block = this.getBlockHashEntry(block).nextBlock;
    }
    return entries;
  }

  extractFileByName(name: string): Uint8Array | null {
    const entry = this.entries.find((e) => e.name === name);
    if (!entry) return null;
    return this.extractFile(entry);
  }

  private extractFile(entry: FileEntry): Uint8Array {
    if (entry.fileSize === 0) return new Uint8Array();
    const blocks: number[] = [];
    if ((entry.flags & 1) !== 0) {
      for (let i = 0; i < entry.blocksForFile; i++) blocks.push(entry.startingBlockNum + i);
    } else {
      let block = entry.startingBlockNum;
      for (let i = 0; i < entry.blocksForFile; i++) {
        blocks.push(block);
        block = this.getBlockHashEntry(block).nextBlock;
      }
    }

    const out = new Uint8Array(entry.fileSize);
    let outPos = 0;
    let remaining = entry.fileSize;
    for (const blockNum of blocks) {
      const addr = this.blockToAddress(blockNum);
      const take = Math.min(remaining, 0x1000);
      out.set(this.data.subarray(addr, addr + take), outPos);
      outPos += take;
      remaining -= take;
      if (remaining <= 0) break;
    }
    return out;
  }
}
