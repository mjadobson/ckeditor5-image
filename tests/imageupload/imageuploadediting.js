/**
 * @license Copyright (c) 2003-2018, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/* globals window, setTimeout */

import VirtualTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/virtualtesteditor';

import Plugin from '@ckeditor/ckeditor5-core/src/plugin';
import Clipboard from '@ckeditor/ckeditor5-clipboard/src/clipboard';
import ImageEditing from '../../src/image/imageediting';
import ImageUploadEditing from '../../src/imageupload/imageuploadediting';
import ImageUploadCommand from '../../src/imageupload/imageuploadcommand';
import Paragraph from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import UndoEditing from '@ckeditor/ckeditor5-undo/src/undoediting';
import DataTransfer from '@ckeditor/ckeditor5-clipboard/src/datatransfer';

import FileRepository from '@ckeditor/ckeditor5-upload/src/filerepository';
import { UploadAdapterMock, createNativeFileMock, NativeFileReaderMock } from '@ckeditor/ckeditor5-upload/tests/_utils/mocks';

import { setData as setModelData, getData as getModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model';
import { getData as getViewData } from '@ckeditor/ckeditor5-engine/src/dev-utils/view';
import Range from '@ckeditor/ckeditor5-engine/src/model/range';
import Position from '@ckeditor/ckeditor5-engine/src/model/position';

import log from '@ckeditor/ckeditor5-utils/src/log';
import testUtils from '@ckeditor/ckeditor5-core/tests/_utils/utils';
import Notification from '@ckeditor/ckeditor5-ui/src/notification/notification';

describe( 'ImageUploadEditing', () => {
	// eslint-disable-next-line max-len
	const base64Sample = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
	let editor, model, view, doc, fileRepository, viewDocument, nativeReaderMock, loader, adapterMock;

	testUtils.createSinonSandbox();

	class UploadAdapterPluginMock extends Plugin {
		init() {
			fileRepository = this.editor.plugins.get( FileRepository );
			fileRepository.createUploadAdapter = newLoader => {
				loader = newLoader;
				adapterMock = new UploadAdapterMock( loader );

				return adapterMock;
			};
		}
	}

	beforeEach( () => {
		testUtils.sinon.stub( window, 'FileReader' ).callsFake( () => {
			nativeReaderMock = new NativeFileReaderMock();

			return nativeReaderMock;
		} );

		return VirtualTestEditor
			.create( {
				plugins: [ ImageEditing, ImageUploadEditing, Paragraph, UndoEditing, UploadAdapterPluginMock ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;
				doc = model.document;
				view = editor.editing.view;
				viewDocument = view.document;
			} );
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	it( 'should register proper schema rules', () => {
		expect( model.schema.checkAttribute( [ '$root', 'image' ], 'uploadId' ) ).to.be.true;
	} );

	it( 'should register imageUpload command', () => {
		expect( editor.commands.get( 'imageUpload' ) ).to.be.instanceOf( ImageUploadCommand );
	} );

	it( 'should insert image when is pasted', () => {
		const fileMock = createNativeFileMock();
		const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );
		setModelData( model, '<paragraph>[]foo</paragraph>' );

		const targetRange = Range.createFromParentsAndOffsets( doc.getRoot(), 1, doc.getRoot(), 1 );
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		const id = fileRepository.getLoader( fileMock ).id;
		expect( getModelData( model ) ).to.equal(
			`<paragraph>foo</paragraph>[<image uploadId="${ id }" uploadStatus="reading"></image>]`
		);
	} );

	it( 'should insert image at optimized position when is pasted', () => {
		const fileMock = createNativeFileMock();
		const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );
		setModelData( model, '<paragraph>[]foo</paragraph>' );

		const paragraph = doc.getRoot().getChild( 0 );
		const targetRange = Range.createFromParentsAndOffsets( paragraph, 1, paragraph, 1 ); // f[]oo
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		const id = fileRepository.getLoader( fileMock ).id;
		expect( getModelData( model ) ).to.equal(
			`[<image uploadId="${ id }" uploadStatus="reading"></image>]<paragraph>foo</paragraph>`
		);
	} );

	it( 'should insert multiple image files when are pasted', () => {
		const files = [ createNativeFileMock(), createNativeFileMock() ];
		const dataTransfer = new DataTransfer( { files, types: [ 'Files' ] } );
		setModelData( model, '<paragraph>[]foo</paragraph>' );

		const targetRange = Range.createFromParentsAndOffsets( doc.getRoot(), 1, doc.getRoot(), 1 );
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		const id1 = fileRepository.getLoader( files[ 0 ] ).id;
		const id2 = fileRepository.getLoader( files[ 1 ] ).id;

		expect( getModelData( model ) ).to.equal(
			'<paragraph>foo</paragraph>' +
			`<image uploadId="${ id1 }" uploadStatus="reading"></image>` +
			`[<image uploadId="${ id2 }" uploadStatus="reading"></image>]`
		);
	} );

	it( 'should insert image when is pasted on allowed position when ImageUploadCommand is disabled', () => {
		const fileMock = createNativeFileMock();
		const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );
		setModelData( model, '<paragraph>[]foo</paragraph>' );

		const command = editor.commands.get( 'imageUpload' );

		command.on( 'set:isEnabled', evt => {
			evt.return = false;
			evt.stop();
		}, { priority: 'highest' } );

		command.isEnabled = false;

		const targetRange = Range.createFromParentsAndOffsets( doc.getRoot(), 1, doc.getRoot(), 1 );
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		const id = fileRepository.getLoader( fileMock ).id;
		expect( getModelData( model ) ).to.equal(
			`<paragraph>foo</paragraph>[<image uploadId="${ id }" uploadStatus="reading"></image>]`
		);
	} );

	it( 'should not insert image when editor is in read-only mode', () => {
		// Clipboard plugin is required for this test.
		return VirtualTestEditor
			.create( {
				plugins: [ ImageEditing, ImageUploadEditing, Paragraph, UploadAdapterPluginMock, Clipboard ]
			} )
			.then( editor => {
				const fileMock = createNativeFileMock();
				const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );
				setModelData( editor.model, '<paragraph>[]foo</paragraph>' );

				const targetRange = editor.model.document.selection.getFirstRange();
				const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

				editor.isReadOnly = true;

				editor.editing.view.document.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

				expect( getModelData( editor.model ) ).to.equal( '<paragraph>[]foo</paragraph>' );

				return editor.destroy();
			} );
	} );

	it( 'should not insert image when file is not an image', () => {
		const viewDocument = editor.editing.view.document;
		const fileMock = {
			type: 'media/mp3',
			size: 1024
		};
		const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );

		setModelData( model, '<paragraph>foo[]</paragraph>' );

		const targetRange = doc.selection.getFirstRange();
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		expect( getModelData( model ) ).to.equal( '<paragraph>foo[]</paragraph>' );
	} );

	it( 'should not insert image nor crash when pasted image could not be inserted', () => {
		model.schema.register( 'other', {
			allowIn: '$root',
			isLimit: true
		} );
		model.schema.extend( '$text', { allowIn: 'other' } );

		editor.conversion.elementToElement( { model: 'other', view: 'p' } );

		setModelData( model, '<other>[]</other>' );

		const fileMock = createNativeFileMock();
		const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );

		const targetRange = doc.selection.getFirstRange();
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		expect( getModelData( model ) ).to.equal( '<other>[]</other>' );
	} );

	it( 'should not throw when upload adapter is not set (FileRepository will log an error anyway) when image is pasted', () => {
		const fileMock = createNativeFileMock();
		const dataTransfer = new DataTransfer( { files: [ fileMock ], types: [ 'Files' ] } );
		const logStub = testUtils.sinon.stub( log, 'error' );

		setModelData( model, '<paragraph>[]foo</paragraph>' );

		fileRepository.createUploadAdapter = undefined;

		const targetRange = Range.createFromParentsAndOffsets( doc.getRoot(), 1, doc.getRoot(), 1 );
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		expect( () => {
			viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );
		} ).to.not.throw();

		expect( getModelData( model ) ).to.equal( '<paragraph>[]foo</paragraph>' );
		sinon.assert.calledOnce( logStub );
	} );

	// https://github.com/ckeditor/ckeditor5-upload/issues/70
	it( 'should not crash on browsers which do not implement DOMStringList as a child class of an Array', () => {
		const typesDomStringListMock = {
			length: 2,
			'0': 'text/html',
			'1': 'text/plain'
		};
		const dataTransfer = new DataTransfer( {
			types: typesDomStringListMock,
			getData: type => type === 'text/html' ? '<p>SomeData</p>' : 'SomeData'
		} );
		setModelData( model, '<paragraph>[]foo</paragraph>' );

		const targetRange = doc.selection.getFirstRange();
		const targetViewRange = editor.editing.mapper.toViewRange( targetRange );

		viewDocument.fire( 'clipboardInput', { dataTransfer, targetRanges: [ targetViewRange ] } );

		// Well, there's no clipboard plugin, so nothing happens.
		expect( getModelData( model ) ).to.equal( '<paragraph>[]foo</paragraph>' );
	} );

	it( 'should not convert image\'s uploadId attribute if is consumed already', () => {
		editor.editing.downcastDispatcher.on( 'attribute:uploadId:image', ( evt, data, conversionApi ) => {
			conversionApi.consumable.consume( data.item, evt.name );
		}, { priority: 'high' } );

		setModelData( model, '<image uploadId="1234"></image>' );

		expect( getViewData( view ) ).to.equal(
			'[<figure class="ck-widget image" contenteditable="false">' +
				'<img></img>' +
			'</figure>]' );
	} );

	it( 'should use read data once it is present', done => {
		const file = createNativeFileMock();
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		model.once( '_change', () => {
			expect( getViewData( view ) ).to.equal(
				'[<figure class="ck-widget image" contenteditable="false">' +
				`<img src="${ base64Sample }"></img>` +
				'</figure>]' +
				'<p>foo bar</p>' );
			expect( loader.status ).to.equal( 'uploading' );

			done();
		} );

		expect( loader.status ).to.equal( 'reading' );
		nativeReaderMock.mockSuccess( base64Sample );
	} );

	it( 'should replace read data with server response once it is present', done => {
		const file = createNativeFileMock();
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		model.document.once( 'change', () => {
			model.document.once( 'change', () => {
				expect( getViewData( view ) ).to.equal(
					'[<figure class="ck-widget image" contenteditable="false"><img src="image.png"></img></figure>]<p>foo bar</p>'
				);
				expect( loader.status ).to.equal( 'idle' );

				done();
			}, { priority: 'lowest' } );

			adapterMock.mockSuccess( { default: 'image.png' } );
		} );

		nativeReaderMock.mockSuccess( base64Sample );
	} );

	it( 'should fire notification event in case of error', done => {
		const notification = editor.plugins.get( Notification );
		const file = createNativeFileMock();

		notification.on( 'show:warning', ( evt, data ) => {
			expect( data.message ).to.equal( 'Reading error.' );
			expect( data.title ).to.equal( 'Upload failed' );
			evt.stop();

			done();
		}, { priority: 'high' } );

		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		nativeReaderMock.mockError( 'Reading error.' );
	} );

	it( 'should not fire notification on abort', done => {
		const notification = editor.plugins.get( Notification );
		const file = createNativeFileMock();
		const spy = testUtils.sinon.spy();

		notification.on( 'show:warning', evt => {
			spy();
			evt.stop();
		}, { priority: 'high' } );

		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );
		nativeReaderMock.abort();

		setTimeout( () => {
			sinon.assert.notCalled( spy );
			done();
		}, 0 );
	} );

	it( 'should throw when other error happens during upload', done => {
		const file = createNativeFileMock();
		const error = new Error( 'Foo bar baz' );
		const uploadEditing = editor.plugins.get( ImageUploadEditing );
		const loadSpy = sinon.spy( uploadEditing, '_load' );
		const catchSpy = sinon.spy();

		// Throw an error when async attribute change occur.
		editor.editing.downcastDispatcher.on( 'attribute:uploadStatus:image', ( evt, data ) => {
			if ( data.attributeNewValue == 'uploading' ) {
				throw error;
			}
		} );

		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		sinon.assert.calledOnce( loadSpy );

		const promise = loadSpy.returnValues[ 0 ];

		// Check if error can be caught.
		promise.catch( catchSpy );

		nativeReaderMock.mockSuccess();

		setTimeout( () => {
			sinon.assert.calledOnce( catchSpy );
			sinon.assert.calledWithExactly( catchSpy, error );
			done();
		}, 0 );
	} );

	it( 'should do nothing if image does not have uploadId', () => {
		setModelData( model, '<image src="image.png"></image>' );

		expect( getViewData( view ) ).to.equal(
			'[<figure class="ck-widget image" contenteditable="false"><img src="image.png"></img></figure>]'
		);
	} );

	it( 'should remove image in case of upload error', done => {
		const file = createNativeFileMock();
		const spy = testUtils.sinon.spy();
		const notification = editor.plugins.get( Notification );
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );

		notification.on( 'show:warning', evt => {
			spy();
			evt.stop();
		}, { priority: 'high' } );

		editor.execute( 'imageUpload', { file } );

		model.document.once( 'change', () => {
			model.document.once( 'change', () => {
				expect( getModelData( model ) ).to.equal( '<paragraph>[]foo bar</paragraph>' );
				sinon.assert.calledOnce( spy );

				done();
			} );
		} );

		nativeReaderMock.mockError( 'Upload error.' );
	} );

	it( 'should abort upload if image is removed', () => {
		const file = createNativeFileMock();
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		const abortSpy = testUtils.sinon.spy( loader, 'abort' );

		expect( loader.status ).to.equal( 'reading' );
		nativeReaderMock.mockSuccess( base64Sample );

		const image = doc.getRoot().getChild( 0 );
		model.change( writer => {
			writer.remove( image );
		} );

		expect( loader.status ).to.equal( 'aborted' );
		sinon.assert.calledOnce( abortSpy );
	} );

	it( 'should not abort and not restart upload when image is moved', () => {
		const file = createNativeFileMock();
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		const abortSpy = testUtils.sinon.spy( loader, 'abort' );
		const loadSpy = testUtils.sinon.spy( loader, 'read' );

		const image = doc.getRoot().getChild( 0 );

		model.change( writer => {
			writer.move( Range.createOn( image ), Position.createAt( doc.getRoot(), 2 ) );
		} );

		expect( abortSpy.called ).to.be.false;
		expect( loadSpy.called ).to.be.false;
	} );

	it( 'image should be permanently removed if it is removed by user during upload', done => {
		const file = createNativeFileMock();
		const notification = editor.plugins.get( Notification );
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );

		// Prevent popping up alert window.
		notification.on( 'show:warning', evt => {
			evt.stop();
		}, { priority: 'high' } );

		editor.execute( 'imageUpload', { file } );

		model.document.once( 'change', () => {
			// This is called after "manual" remove.
			model.document.once( 'change', () => {
				// This is called after attributes are removed.
				let undone = false;

				model.document.once( 'change', () => {
					if ( !undone ) {
						undone = true;

						// This is called after abort remove.
						expect( getModelData( model ) ).to.equal( '<paragraph>[]foo bar</paragraph>' );

						editor.execute( 'undo' );

						// Expect that the image has not been brought back.
						expect( getModelData( model ) ).to.equal( '<paragraph>[]foo bar</paragraph>' );

						done();
					}
				} );
			} );
		} );

		const image = doc.getRoot().getChild( 0 );

		model.change( writer => {
			writer.remove( image );
		} );
	} );

	it( 'should create responsive image if server return multiple images', done => {
		const file = createNativeFileMock();
		setModelData( model, '<paragraph>{}foo bar</paragraph>' );
		editor.execute( 'imageUpload', { file } );

		model.document.once( 'change', () => {
			model.document.once( 'change', () => {
				expect( getViewData( view ) ).to.equal(
					'[<figure class="ck-widget image" contenteditable="false">' +
						'<img sizes="100vw" src="image.png" srcset="image-500.png 500w, image-800.png 800w" width="800"></img>' +
					'</figure>]<p>foo bar</p>'
				);
				expect( loader.status ).to.equal( 'idle' );

				done();
			}, { priority: 'lowest' } );

			adapterMock.mockSuccess( { default: 'image.png', 500: 'image-500.png', 800: 'image-800.png' } );
		} );

		nativeReaderMock.mockSuccess( base64Sample );
	} );

	it( 'should prevent from browser redirecting when an image is dropped on another image', () => {
		const spy = testUtils.sinon.spy();

		editor.editing.view.document.fire( 'dragover', {
			preventDefault: spy
		} );

		expect( spy.calledOnce ).to.equal( true );
	} );
} );
