/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sep } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import * as glob from 'vs/base/common/glob';
import { isLinux } from 'vs/base/common/platform';
import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { startsWithIgnoreCase } from 'vs/base/common/strings';
import { IDisposable } from 'vs/base/common/lifecycle';
import { isEqualOrParent, isEqual } from 'vs/base/common/resources';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { VSBuffer, VSBufferReadable, VSBufferReadableStream } from 'vs/base/common/buffer';

export const IFileService = createDecorator<IFileService>('fileService');

export interface IFileService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * An event that is fired when a file system provider is added or removed
	 */
	readonly onDidChangeFileSystemProviderRegistrations: Event<IFileSystemProviderRegistrationEvent>;

	/**
	 * An event that is fired when a file system provider is about to be activated. Listeners
	 * can join this event with a long running promise to help in the activation process.
	 */
	readonly onWillActivateFileSystemProvider: Event<IFileSystemProviderActivationEvent>;

	/**
	 * Registers a file system provider for a certain scheme.
	 */
	registerProvider(scheme: string, provider: IFileSystemProvider): IDisposable;

	/**
	 * Tries to activate a provider with the given scheme.
	 */
	activateProvider(scheme: string): Promise<void>;

	/**
	 * Checks if this file service can handle the given resource.
	 */
	canHandleResource(resource: URI): boolean;

	/**
	 * Checks if the provider for the provided resource has the provided file system capability.
	 */
	hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean;

	/**
	 * Allows to listen for file changes. The event will fire for every file within the opened workspace
	 * (if any) as well as all files that have been watched explicitly using the #watch() API.
	 */
	readonly onFileChanges: Event<FileChangesEvent>;

	/**
	 * An event that is fired upon successful completion of a certain file operation.
	 */
	readonly onAfterOperation: Event<FileOperationEvent>;

	/**
	 * Resolve the properties of a file/folder identified by the resource.
	 *
	 * If the optional parameter "resolveTo" is specified in options, the stat service is asked
	 * to provide a stat object that should contain the full graph of folders up to all of the
	 * target resources.
	 *
	 * If the optional parameter "resolveSingleChildDescendants" is specified in options,
	 * the stat service is asked to automatically resolve child folders that only
	 * contain a single element.
	 *
	 * If the optional parameter "resolveMetadata" is specified in options,
	 * the stat will contain metadata information such as size, mtime and etag.
	 */
	resolve(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
	resolve(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;

	/**
	 * Same as resolve() but supports resolving multiple resources in parallel.
	 * If one of the resolve targets fails to resolve returns a fake IFileStat instead of making the whole call fail.
	 */
	resolveAll(toResolve: { resource: URI, options: IResolveMetadataFileOptions }[]): Promise<IResolveFileResult[]>;
	resolveAll(toResolve: { resource: URI, options?: IResolveFileOptions }[]): Promise<IResolveFileResult[]>;

	/**
	 * Finds out if a file/folder identified by the resource exists.
	 */
	exists(resource: URI): Promise<boolean>;

	/**
	 * Read the contents of the provided resource unbuffered.
	 */
	readFile(resource: URI, options?: IReadFileOptions): Promise<IFileContent>;

	/**
	 * Read the contents of the provided resource buffered as stream.
	 */
	readFileStream(resource: URI, options?: IReadFileOptions): Promise<IFileStreamContent>;

	/**
	 * Updates the content replacing its previous value.
	 */
	writeFile(resource: URI, bufferOrReadableOrStream: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: IWriteFileOptions): Promise<IFileStatWithMetadata>;

	/**
	 * Moves the file/folder to a new path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	move(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata>;

	/**
	 * Copies the file/folder to a path identified by the resource.
	 *
	 * The optional parameter overwrite can be set to replace an existing file at the location.
	 */
	copy(source: URI, target: URI, overwrite?: boolean): Promise<IFileStatWithMetadata>;

	/**
	 * Creates a new file with the given path and optional contents. The returned promise
	 * will have the stat model object as a result.
	 *
	 * The optional parameter content can be used as value to fill into the new file.
	 */
	createFile(resource: URI, bufferOrReadableOrStream?: VSBuffer | VSBufferReadable | VSBufferReadableStream, options?: ICreateFileOptions): Promise<IFileStatWithMetadata>;

	/**
	 * Creates a new folder with the given path. The returned promise
	 * will have the stat model object as a result.
	 */
	createFolder(resource: URI): Promise<IFileStatWithMetadata>;

	/**
	 * Deletes the provided file. The optional useTrash parameter allows to
	 * move the file to trash. The optional recursive parameter allows to delete
	 * non-empty folders recursively.
	 */
	del(resource: URI, options?: { useTrash?: boolean, recursive?: boolean }): Promise<void>;

	/**
	 * Allows to start a watcher that reports file/folder change events on the provided resource.
	 *
	 * Note: watching a folder does not report events recursively for child folders yet.
	 */
	watch(resource: URI): IDisposable;

	/**
	 * Frees up any resources occupied by this service.
	 */
	dispose(): void;
}

export interface FileOverwriteOptions {
	overwrite: boolean;
}

export interface FileWriteOptions {
	overwrite: boolean;
	create: boolean;
}

export interface FileOpenOptions {
	create: boolean;
}

export interface FileDeleteOptions {
	recursive: boolean;
	useTrash: boolean;
}

export enum FileType {
	Unknown = 0,
	File = 1,
	Directory = 2,
	SymbolicLink = 64
}

export interface IStat {
	type: FileType;
	mtime: number;
	ctime: number;
	size: number;
}

export interface IWatchOptions {
	recursive: boolean;
	excludes: string[];
}

export const enum FileSystemProviderCapabilities {
	FileReadWrite = 1 << 1,
	FileOpenReadWriteClose = 1 << 2,
	FileFolderCopy = 1 << 3,

	PathCaseSensitive = 1 << 10,
	Readonly = 1 << 11,

	Trash = 1 << 12
}

export interface IFileSystemProvider {

	readonly capabilities: FileSystemProviderCapabilities;
	readonly onDidChangeCapabilities: Event<void>;

	readonly onDidErrorOccur?: Event<string>; // TODO@ben remove once file watchers are solid

	readonly onDidChangeFile: Event<IFileChange[]>;
	watch(resource: URI, opts: IWatchOptions): IDisposable;

	stat(resource: URI): Promise<IStat>;
	mkdir(resource: URI): Promise<void>;
	readdir(resource: URI): Promise<[string, FileType][]>;
	delete(resource: URI, opts: FileDeleteOptions): Promise<void>;

	rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;
	copy?(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;

	readFile?(resource: URI): Promise<Uint8Array>;
	writeFile?(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void>;

	open?(resource: URI, opts: FileOpenOptions): Promise<number>;
	close?(fd: number): Promise<void>;
	read?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
	write?(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
}

export interface IFileSystemProviderWithFileReadWriteCapability extends IFileSystemProvider {
	readFile(resource: URI): Promise<Uint8Array>;
	writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void>;
}

export function hasReadWriteCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileReadWriteCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileReadWrite);
}

export interface IFileSystemProviderWithFileFolderCopyCapability extends IFileSystemProvider {
	copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void>;
}

export function hasFileFolderCopyCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithFileFolderCopyCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileFolderCopy);
}

export interface IFileSystemProviderWithOpenReadWriteCloseCapability extends IFileSystemProvider {
	open(resource: URI, opts: FileOpenOptions): Promise<number>;
	close(fd: number): Promise<void>;
	read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
	write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number>;
}

export function hasOpenReadWriteCloseCapability(provider: IFileSystemProvider): provider is IFileSystemProviderWithOpenReadWriteCloseCapability {
	return !!(provider.capabilities & FileSystemProviderCapabilities.FileOpenReadWriteClose);
}

export enum FileSystemProviderErrorCode {
	FileExists = 'EntryExists',
	FileNotFound = 'EntryNotFound',
	FileNotADirectory = 'EntryNotADirectory',
	FileIsADirectory = 'EntryIsADirectory',
	NoPermissions = 'NoPermissions',
	Unavailable = 'Unavailable',
	Unknown = 'Unknown'
}

export class FileSystemProviderError extends Error {

	constructor(message: string, public readonly code: FileSystemProviderErrorCode) {
		super(message);
	}
}

export function createFileSystemProviderError(error: Error, code: FileSystemProviderErrorCode): FileSystemProviderError {
	const providerError = new FileSystemProviderError(error.toString(), code);
	markAsFileSystemProviderError(providerError, code);

	return providerError;
}

export function markAsFileSystemProviderError(error: Error, code: FileSystemProviderErrorCode): Error {
	error.name = code ? `${code} (FileSystemError)` : `FileSystemError`;

	return error;
}

export function toFileSystemProviderErrorCode(error: Error | undefined | null): FileSystemProviderErrorCode {

	// Guard against abuse
	if (!error) {
		return FileSystemProviderErrorCode.Unknown;
	}

	// FileSystemProviderError comes with the code
	if (error instanceof FileSystemProviderError) {
		return error.code;
	}

	// Any other error, check for name match by assuming that the error
	// went through the markAsFileSystemProviderError() method
	const match = /^(.+) \(FileSystemError\)$/.exec(error.name);
	if (!match) {
		return FileSystemProviderErrorCode.Unknown;
	}

	switch (match[1]) {
		case FileSystemProviderErrorCode.FileExists: return FileSystemProviderErrorCode.FileExists;
		case FileSystemProviderErrorCode.FileIsADirectory: return FileSystemProviderErrorCode.FileIsADirectory;
		case FileSystemProviderErrorCode.FileNotADirectory: return FileSystemProviderErrorCode.FileNotADirectory;
		case FileSystemProviderErrorCode.FileNotFound: return FileSystemProviderErrorCode.FileNotFound;
		case FileSystemProviderErrorCode.NoPermissions: return FileSystemProviderErrorCode.NoPermissions;
		case FileSystemProviderErrorCode.Unavailable: return FileSystemProviderErrorCode.Unavailable;
	}

	return FileSystemProviderErrorCode.Unknown;
}

export function toFileOperationResult(error: Error): FileOperationResult {

	// FileSystemProviderError comes with the result already
	if (error instanceof FileOperationError) {
		return error.fileOperationResult;
	}

	// Otherwise try to find from code
	switch (toFileSystemProviderErrorCode(error)) {
		case FileSystemProviderErrorCode.FileNotFound:
			return FileOperationResult.FILE_NOT_FOUND;
		case FileSystemProviderErrorCode.FileIsADirectory:
			return FileOperationResult.FILE_IS_DIRECTORY;
		case FileSystemProviderErrorCode.NoPermissions:
			return FileOperationResult.FILE_PERMISSION_DENIED;
		case FileSystemProviderErrorCode.FileExists:
			return FileOperationResult.FILE_MOVE_CONFLICT;
		case FileSystemProviderErrorCode.FileNotADirectory:
		default:
			return FileOperationResult.FILE_OTHER_ERROR;
	}
}

export interface IFileSystemProviderRegistrationEvent {
	added: boolean;
	scheme: string;
	provider?: IFileSystemProvider;
}

export interface IFileSystemProviderActivationEvent {
	scheme: string;
	join(promise: Promise<void>): void;
}

export const enum FileOperation {
	CREATE,
	DELETE,
	MOVE,
	COPY
}

export class FileOperationEvent {

	constructor(resource: URI, operation: FileOperation.DELETE);
	constructor(resource: URI, operation: FileOperation.CREATE | FileOperation.MOVE | FileOperation.COPY, target: IFileStatWithMetadata);
	constructor(public readonly resource: URI, public readonly operation: FileOperation, public readonly target?: IFileStatWithMetadata) { }

	isOperation(operation: FileOperation.DELETE): boolean;
	isOperation(operation: FileOperation.MOVE | FileOperation.COPY | FileOperation.CREATE): this is { readonly target: IFileStatWithMetadata };
	isOperation(operation: FileOperation): boolean {
		return this.operation === operation;
	}
}

/**
 * Possible changes that can occur to a file.
 */
export const enum FileChangeType {
	UPDATED = 0,
	ADDED = 1,
	DELETED = 2
}

/**
 * Identifies a single change in a file.
 */
export interface IFileChange {

	/**
	 * The type of change that occurred to the file.
	 */
	type: FileChangeType;

	/**
	 * The unified resource identifier of the file that changed.
	 */
	resource: URI;
}

export class FileChangesEvent {

	private _changes: IFileChange[];

	constructor(changes: IFileChange[]) {
		this._changes = changes;
	}

	get changes() {
		return this._changes;
	}

	/**
	 * Returns true if this change event contains the provided file with the given change type (if provided). In case of
	 * type DELETED, this method will also return true if a folder got deleted that is the parent of the
	 * provided file path.
	 */
	contains(resource: URI, type?: FileChangeType): boolean {
		if (!resource) {
			return false;
		}

		const checkForChangeType = !isUndefinedOrNull(type);

		return this._changes.some(change => {
			if (checkForChangeType && change.type !== type) {
				return false;
			}

			// For deleted also return true when deleted folder is parent of target path
			if (change.type === FileChangeType.DELETED) {
				return isEqualOrParent(resource, change.resource, !isLinux /* ignorecase */);
			}

			return isEqual(resource, change.resource, !isLinux /* ignorecase */);
		});
	}

	/**
	 * Returns the changes that describe added files.
	 */
	getAdded(): IFileChange[] {
		return this.getOfType(FileChangeType.ADDED);
	}

	/**
	 * Returns if this event contains added files.
	 */
	gotAdded(): boolean {
		return this.hasType(FileChangeType.ADDED);
	}

	/**
	 * Returns the changes that describe deleted files.
	 */
	getDeleted(): IFileChange[] {
		return this.getOfType(FileChangeType.DELETED);
	}

	/**
	 * Returns if this event contains deleted files.
	 */
	gotDeleted(): boolean {
		return this.hasType(FileChangeType.DELETED);
	}

	/**
	 * Returns the changes that describe updated files.
	 */
	getUpdated(): IFileChange[] {
		return this.getOfType(FileChangeType.UPDATED);
	}

	/**
	 * Returns if this event contains updated files.
	 */
	gotUpdated(): boolean {
		return this.hasType(FileChangeType.UPDATED);
	}

	private getOfType(type: FileChangeType): IFileChange[] {
		return this._changes.filter(change => change.type === type);
	}

	private hasType(type: FileChangeType): boolean {
		return this._changes.some(change => {
			return change.type === type;
		});
	}
}

export function isParent(path: string, candidate: string, ignoreCase?: boolean): boolean {
	if (!path || !candidate || path === candidate) {
		return false;
	}

	if (candidate.length > path.length) {
		return false;
	}

	if (candidate.charAt(candidate.length - 1) !== sep) {
		candidate += sep;
	}

	if (ignoreCase) {
		return startsWithIgnoreCase(path, candidate);
	}

	return path.indexOf(candidate) === 0;
}

interface IBaseStat {

	/**
	 * The unified resource identifier of this file or folder.
	 */
	resource: URI;

	/**
	 * The name which is the last segment
	 * of the {{path}}.
	 */
	name: string;

	/**
	 * The size of the file.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	size?: number;

	/**
	 * The last modification date represented
	 * as millis from unix epoch.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	mtime?: number;

	/**
	 * A unique identifier thet represents the
	 * current state of the file or directory.
	 *
	 * The value may or may not be resolved as
	 * it is optional.
	 */
	etag?: string;

	/**
	 * The resource is readonly.
	 */
	isReadonly?: boolean;
}

export interface IBaseStatWithMetadata extends IBaseStat {
	mtime: number;
	etag: string;
	size: number;
}

/**
 * A file resource with meta information.
 */
export interface IFileStat extends IBaseStat {

	/**
	 * The resource is a directory
	 */
	isDirectory: boolean;

	/**
	 * The resource is a symbolic link.
	 */
	isSymbolicLink?: boolean;

	/**
	 * The children of the file stat or undefined if none.
	 */
	children?: IFileStat[];
}

export interface IFileStatWithMetadata extends IFileStat, IBaseStatWithMetadata {
	mtime: number;
	etag: string;
	size: number;
	children?: IFileStatWithMetadata[];
}

export interface IResolveFileResult {
	stat?: IFileStat;
	success: boolean;
}

export interface IResolveFileResultWithMetadata extends IResolveFileResult {
	stat?: IFileStatWithMetadata;
}

export interface IFileContent extends IBaseStatWithMetadata {

	/**
	 * The content of a file as buffer.
	 */
	value: VSBuffer;
}

export interface IFileStreamContent extends IBaseStatWithMetadata {

	/**
	 * The content of a file as stream.
	 */
	value: VSBufferReadableStream;
}

export interface IReadFileOptions {

	/**
	 * The optional etag parameter allows to return early from resolving the resource if
	 * the contents on disk match the etag. This prevents accumulated reading of resources
	 * that have been read already with the same etag.
	 * It is the task of the caller to makes sure to handle this error case from the promise.
	 */
	etag?: string;

	/**
	 * Is an integer specifying where to begin reading from in the file. If position is null,
	 * data will be read from the current file position.
	 */
	position?: number;

	/**
	 * Is an integer specifying how many bytes to read from the file. By default, all bytes
	 * will be read.
	 */
	length?: number;

	/**
	 * If provided, the size of the file will be checked against the limits.
	 */
	limits?: {
		size?: number;
		memory?: number;
	};
}

export interface IWriteFileOptions {

	/**
	 * The last known modification time of the file. This can be used to prevent dirty writes.
	 */
	mtime?: number;

	/**
	 * The etag of the file. This can be used to prevent dirty writes.
	 */
	etag?: string;
}

export interface IResolveFileOptions {

	/**
	 * Automatically continue resolving children of a directory until the provided resources
	 * are found.
	 */
	resolveTo?: URI[];

	/**
	 * Automatically continue resolving children of a directory if the number of children is 1.
	 */
	resolveSingleChildDescendants?: boolean;

	/**
	 * Will resolve mtime, size and etag of files if enabled. This can have a negative impact
	 * on performance and thus should only be used when these values are required.
	 */
	resolveMetadata?: boolean;
}

export interface IResolveMetadataFileOptions extends IResolveFileOptions {
	resolveMetadata: true;
}

export interface ICreateFileOptions {

	/**
	 * Overwrite the file to create if it already exists on disk. Otherwise
	 * an error will be thrown (FILE_MODIFIED_SINCE).
	 */
	overwrite?: boolean;
}

export class FileOperationError extends Error {
	constructor(message: string, public fileOperationResult: FileOperationResult, public options?: IReadFileOptions & IWriteFileOptions & ICreateFileOptions) {
		super(message);
	}

	static isFileOperationError(obj: unknown): obj is FileOperationError {
		return obj instanceof Error && !isUndefinedOrNull((obj as FileOperationError).fileOperationResult);
	}
}

export const enum FileOperationResult {
	FILE_IS_DIRECTORY,
	FILE_NOT_FOUND,
	FILE_NOT_MODIFIED_SINCE,
	FILE_MODIFIED_SINCE,
	FILE_MOVE_CONFLICT,
	FILE_READ_ONLY,
	FILE_PERMISSION_DENIED,
	FILE_TOO_LARGE,
	FILE_INVALID_PATH,
	FILE_EXCEED_MEMORY_LIMIT,
	FILE_OTHER_ERROR
}

export const AutoSaveConfiguration = {
	OFF: 'off',
	AFTER_DELAY: 'afterDelay',
	ON_FOCUS_CHANGE: 'onFocusChange',
	ON_WINDOW_CHANGE: 'onWindowChange'
};

export const HotExitConfiguration = {
	OFF: 'off',
	ON_EXIT: 'onExit',
	ON_EXIT_AND_WINDOW_CLOSE: 'onExitAndWindowClose'
};

export const CONTENT_CHANGE_EVENT_BUFFER_DELAY = 1000;

export const FILES_ASSOCIATIONS_CONFIG = 'files.associations';
export const FILES_EXCLUDE_CONFIG = 'files.exclude';

export interface IFilesConfiguration {
	files: {
		associations: { [filepattern: string]: string };
		exclude: glob.IExpression;
		watcherExclude: { [filepattern: string]: boolean };
		encoding: string;
		autoGuessEncoding: boolean;
		defaultLanguage: string;
		trimTrailingWhitespace: boolean;
		autoSave: string;
		autoSaveDelay: number;
		eol: string;
		enableTrash: boolean;
		hotExit: string;
	};
}

export enum FileKind {
	FILE,
	FOLDER,
	ROOT_FOLDER
}

export const MIN_MAX_MEMORY_SIZE_MB = 2048;
export const FALLBACK_MAX_MEMORY_SIZE_MB = 4096;

/**
 * A hint to disable etag checking for reading/writing.
 */
export const ETAG_DISABLED = '';

export function etag(stat: { mtime: number, size: number }): string;
export function etag(stat: { mtime: number | undefined, size: number | undefined }): string | undefined;
export function etag(stat: { mtime: number | undefined, size: number | undefined }): string | undefined {
	if (typeof stat.size !== 'number' || typeof stat.mtime !== 'number') {
		return undefined;
	}

	return stat.mtime.toString(29) + stat.size.toString(31);
}
