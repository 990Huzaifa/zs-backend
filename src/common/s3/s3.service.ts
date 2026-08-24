import { Injectable } from '@nestjs/common';
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class S3Service {
    private readonly bucketName = process.env.AWS_S3_BUCKET!;
    private readonly region = process.env.AWS_REGION || 'ap-south-1';
    private readonly s3Client: S3Client;

    constructor() {
        this.s3Client = new S3Client({
            region: this.region,
            credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
                ? {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                }
                : undefined,
        });
    }

    async uploadObject(
        key: string,
        body: Buffer | Uint8Array | string,
        contentType?: string,
    ) {
        await this.s3Client.send(
            new PutObjectCommand({
                Bucket: this.bucketName,
                Key: key,
                Body: body,
                ContentType: contentType,
            }),
        );

        return {
            key,
            url: this.getObjectUrl(key),
        };
    }

    async deleteObject(key: string) {
        await this.s3Client.send(
            new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            }),
        );
    }

    async headObject(key: string) {
        return this.s3Client.send(
            new HeadObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            }),
        );
    }

    /**
     * Server-side copy within the same bucket. Source key must exist.
     * CopySource is URL-encoded per S3 requirements.
     */
    async copyObject(sourceKey: string, destinationKey: string) {
        const encodedSourceKey = sourceKey
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('%2F');
        const copySource = `${this.bucketName}/${encodedSourceKey}`;
        await this.s3Client.send(
            new CopyObjectCommand({
                Bucket: this.bucketName,
                Key: destinationKey,
                CopySource: copySource,
            }),
        );
    }

    async getPresignedPutObjectUrl(
        key: string,
        contentType: string,
        expiresInSeconds: number,
    ) {
        const command = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            ContentType: contentType,
        });
        return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
    }

    async getPresignedGetObjectUrl(key: string, expiresInSeconds: number) {
        const command = new GetObjectCommand({
            Bucket: this.bucketName,
            Key: key,
        });
        return getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
    }

    getObjectUrl(key: string) {
        return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
    }

}
