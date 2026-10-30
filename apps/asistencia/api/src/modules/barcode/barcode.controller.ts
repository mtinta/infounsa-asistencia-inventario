import {
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { BarcodeService } from './barcode.service';
import { Public } from '../../common/auth/public.decorator';
import * as fs from 'fs';
import * as path from 'path';

@Controller('barcode')
export class BarcodeController {
  constructor(private readonly barcodeService: BarcodeService) {}

  // === RUTA PARA VER LA INTERFAZ DE LA CÁMARA (NUEVO) ===
  @Public()
  @Get('scanner')
  async getScannerInterface(@Res() res: Response) {
    // Apuntamos directamente al archivo HTML en esta misma carpeta
    const htmlPath = path.join(__dirname, 'barcode-scanner.html');
    
    if (!fs.existsSync(htmlPath)) {
      throw new BadRequestException('No se encontró el archivo de la interfaz del escáner.');
    }

    res.setHeader('Content-Type', 'text/html');
    return fs.createReadStream(htmlPath).pipe(res);
  }

  @Public()
  @Get('simulate')
  async simulateBarcode(
    @Query('text') text: string,
    @Query('type') type: string,
    @Res() res: Response,
  ) {
    if (!text) return res.status(400).json({ message: 'El parámetro "text" es requerido' });
    try {
      const barcodeBuffer = await this.barcodeService.generateBarcode(text, type || 'code128');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', barcodeBuffer.length.toString());
      res.end(barcodeBuffer);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      return res.status(400).json({ message: msg });
    }
  }

  @Public()
  @Post('read')
  @UseInterceptors(FileInterceptor('file'))
  async readBarcode(@UploadedFile() file?: { buffer?: Buffer }) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Es necesario subir un archivo de imagen válido.');
    }
    
    const textData = await this.barcodeService.readBarcode(file.buffer);
    
    return {
      success: true,
      data: textData,
    };
  }
}
