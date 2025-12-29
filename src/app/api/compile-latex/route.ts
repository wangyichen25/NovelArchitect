/**
 * API Route: Compile LaTeX to PDF
 * 
 * This endpoint receives LaTeX content and returns a compiled PDF file
 * using pdflatex and biber for bibliography processing.
 * Multi-pass compilation: pdflatex → biber → pdflatex → pdflatex
 */

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';

const execAsync = promisify(exec);

// Timeout for each compilation pass (30 seconds)
const COMPILE_TIMEOUT = 30000;

export async function POST(request: NextRequest) {
    const tempDir = join(tmpdir(), 'latex-compile', randomUUID());
    const texPath = join(tempDir, 'manuscript.tex');
    const pdfPath = join(tempDir, 'manuscript.pdf');
    const figuresDir = join(tempDir, 'figures');

    try {
        // Parse request body
        const { latex, filename = 'manuscript', images = [] } = await request.json();

        if (!latex || typeof latex !== 'string') {
            return NextResponse.json(
                { error: 'Missing or invalid LaTeX content' },
                { status: 400 }
            );
        }

        // Create temp directory
        await mkdir(tempDir, { recursive: true });

        // Handle images if provided
        if (images && Array.isArray(images) && images.length > 0) {
            await mkdir(figuresDir, { recursive: true });

            for (const img of images) {
                if (img.name && img.data) {
                    try {
                        const cleanName = img.name.replace(/^figures\//, '');
                        const imgPath = join(figuresDir, cleanName);
                        const base64Data = img.data.includes(',') ? img.data.split(',')[1] : img.data;
                        await writeFile(imgPath, Buffer.from(base64Data, 'base64'));
                    } catch (e) {
                        console.error(`Failed to write image ${img.name}:`, e);
                    }
                }
            }
        }

        // Write LaTeX file
        await writeFile(texPath, latex, 'utf-8');

        // Determine the job name (base filename without extension)
        const jobName = 'manuscript';

        // Multi-pass compilation: pdflatex → biber → pdflatex → pdflatex
        // This ensures proper bibliography and cross-reference resolution

        const pdflatexCmd = `pdflatex -interaction=nonstopmode -halt-on-error -jobname=${jobName} manuscript.tex`;
        const biberCmd = `biber ${jobName}`;

        console.log('[compile-latex] Starting compilation in:', tempDir);

        // Pass 1: Initial pdflatex
        try {
            console.log('[compile-latex] Pass 1: pdflatex');
            await execAsync(pdflatexCmd, { cwd: tempDir, timeout: COMPILE_TIMEOUT });
        } catch (err: any) {
            // pdflatex often returns non-zero even on success with warnings
            // Check if PDF was created
            console.warn('[compile-latex] Pass 1 warning:', err.message?.substring(0, 200));
        }

        // Pass 2: Biber for bibliography
        try {
            console.log('[compile-latex] Pass 2: biber');
            await execAsync(biberCmd, { cwd: tempDir, timeout: COMPILE_TIMEOUT });
        } catch (err: any) {
            console.warn('[compile-latex] Biber warning:', err.message?.substring(0, 200));
            // Biber might fail if no citations, continue anyway
        }

        // Pass 3: pdflatex for bibliography integration
        try {
            console.log('[compile-latex] Pass 3: pdflatex');
            await execAsync(pdflatexCmd, { cwd: tempDir, timeout: COMPILE_TIMEOUT });
        } catch (err: any) {
            console.warn('[compile-latex] Pass 3 warning:', err.message?.substring(0, 200));
        }

        // Pass 4: Final pdflatex for cross-references
        try {
            console.log('[compile-latex] Pass 4: pdflatex (final)');
            await execAsync(pdflatexCmd, { cwd: tempDir, timeout: COMPILE_TIMEOUT });
        } catch (err: any) {
            console.warn('[compile-latex] Pass 4 warning:', err.message?.substring(0, 200));
        }

        // Check if PDF was generated
        if (!existsSync(pdfPath)) {
            // Try to read log file for error details
            const logPath = join(tempDir, 'manuscript.log');
            let errorDetails = 'PDF compilation failed. No output generated.';
            try {
                const logContent = await readFile(logPath, 'utf-8');
                // Extract last few error lines
                const lines = logContent.split('\n');
                const errorLines = lines.filter(l => l.startsWith('!') || l.includes('Error'));
                if (errorLines.length > 0) {
                    errorDetails = errorLines.slice(0, 5).join('\n');
                }
            } catch {
                // Log file not available
            }

            return NextResponse.json(
                { error: errorDetails },
                { status: 500 }
            );
        }

        console.log('[compile-latex] Compilation successful');

        // Read PDF
        const pdfBuffer = await readFile(pdfPath);

        // Cleanup temp directory
        try {
            await rm(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.warn('[compile-latex] Cleanup warning:', e);
        }

        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${filename}.pdf"`,
            },
        });

    } catch (error) {
        console.error('[compile-latex] Error:', error);

        // Attempt cleanup
        try {
            await rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('pdflatex') && (errorMessage.includes('not found') || errorMessage.includes('No such file'))) {
            return NextResponse.json(
                { error: 'pdflatex is not installed on the server. Please install TeX Live or MacTeX.' },
                { status: 500 }
            );
        }

        return NextResponse.json(
            { error: `Compilation failed: ${errorMessage}` },
            { status: 500 }
        );
    }
}
