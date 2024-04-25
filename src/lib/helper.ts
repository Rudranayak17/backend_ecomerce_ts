const getBase64 = (file: { mimetype: string; buffer: Buffer }): string =>
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

export{
    getBase64
}