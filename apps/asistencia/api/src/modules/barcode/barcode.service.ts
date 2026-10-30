import { Injectable, BadRequestException } from '@nestjs/common';
// @ts-ignore
import * as bwipjs from 'bwip-js';
import { PNG } from 'pngjs';
import { MultiFormatReader, BinaryBitmap, HybridBinarizer, RGBLuminanceSource } from '@zxing/library';

@Injectable()
export class BarcodeService {
  // 1. GENERACIÓN: Código limpio con fondo blanco garantizado
  async generateBarcode(text: string, type = 'code128'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(
        {
          bcid: type,
          text: text,
          scale: 3,
          height: 10,
          includetext: true,
          textxalign: 'center',
          backgroundcolor: 'FFFFFF', // Genera fondo blanco nativo
        },
        (err: unknown, pngBuffer: Buffer) => {
          if (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return reject(new BadRequestException(`Error generando código: ${msg}`));
          }
          resolve(pngBuffer);
        },
      );
    });
  }

  // 2. LECTURA REHECHA DESDE CERO CON PNGJS (SIN JIMP)
  async readBarcode(imageBuffer: Buffer): Promise<string> {
    try {
      // Parseamos el buffer PNG directamente sin métodos obsoletos
      const png = PNG.sync.read(imageBuffer);
      const { width, height, data } = png;

      const len = width * height;
      const luminanceBuffer = Buffer.alloc(len);
      
      // Convertimos a escala de grises para el motor ZXing
      for (let i = 0; i < len; i++) {
        luminanceBuffer[i] =
          data[i * 4] * 0.2126 +
          data[i * 4 + 1] * 0.7152 +
          data[i * 4 + 2] * 0.0722;
      }

      const luminanceSource = new RGBLuminanceSource(
        luminanceBuffer as any,
        width,
        height
      );
      const binarizer = new HybridBinarizer(luminanceSource);
      const bitmap = new BinaryBitmap(binarizer);

      const reader = new MultiFormatReader();
      const result = reader.decode(bitmap);

      return result.getText();
    } catch (error) {
      throw new BadRequestException(
        'No se pudo decodificar o leer ningún código de barras válido en la imagen. Asegúrate de que la imagen sea nítida.',
      );
    }
  }
}