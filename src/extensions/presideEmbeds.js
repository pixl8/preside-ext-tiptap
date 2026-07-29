/**
 * PresideEmbeds — the image / attachment / widget Tiptap nodes.
 *
 * Each is an inline atom node holding the raw Preside token in a `raw` attribute:
 *   {{image:<urlenc-json>:image}}
 *   {{attachment:<urlenc-json>:attachment}}
 *   {{widget:<id>:<urlenc-json>:widget}}
 *
 * - parseHTML picks up the placeholder <span data-preside-*> that tokens.js
 *   detokenize() injects at load time (mirrors CKEditor's dataFilter text rule).
 * - renderHTML emits that same placeholder <span data-raw="…"> so tokenize()
 *   can turn it straight back into the raw token for getData() (mirrors downcast).
 * - the NodeView renders a live preview fetched from the SAME AJAX endpoints the
 *   CKEditor widgets use (renderEmbeddedImageForEditor / …Attachment… /
 *   renderWidgetPlaceholder).
 * - the toolbar command opens the real Preside picker iframe via PresidePickerModal
 *   using its _config / _widgetConfig commit channel.
 * - presideImage additionally gets drag-to-resize + alignment chrome over that
 *   preview (src/imageTools.js), which writes back into the same token.
 */
import { Node } from "@tiptap/core";
import { openPickerModal, postForm } from "../presidePickerModal.js";
import { attachImageTools } from "../imageTools.js";
import { t } from "../i18n.js";

function makeEmbedNode( opts, deps ) {
	const buildAjaxLink  = deps.buildAjaxLink  || window.buildAjaxLink;
	const buildAdminLink = deps.buildAdminLink || window.buildAdminLink;

	// All three embeds are BLOCK widgets in CKEditor (<div> templates whose
	// downcast is the bare token text), so stored tokens sit between paragraphs,
	// never wrapped in <p>. opts.block mirrors that.
	const tag = opts.block ? "div" : "span";

	return Node.create( {
		name      : opts.name,
		group     : opts.block ? "block" : "inline",
		inline    : !opts.block,
		atom      : true,
		selectable: true,

		addOptions() {
			return { widgetCategories: deps.widgetCategories || "", linkPickerCategory: deps.linkPickerCategory || "" };
		},

		addAttributes() {
			return { raw: { default: null } };
		},

		parseHTML() {
			// Match both tags: legacy content saved by earlier extension versions
			// used a span placeholder for widgets too.
			return [
				  { tag: "div["  + opts.dataAttr + "]", getAttrs: el => ( { raw: el.getAttribute( "data-raw" ) } ) }
				, { tag: "span[" + opts.dataAttr + "]", getAttrs: el => ( { raw: el.getAttribute( "data-raw" ) } ) }
			];
		},

		renderHTML( { node } ) {
			const attrs = { "class": opts.cssClass, "data-raw": node.attrs.raw };
			attrs[ opts.dataAttr ] = "true";
			return [ tag, attrs ];
		},

		addNodeView() {
			const options = this.options;
			return ( { editor, node, getPos } ) => makePreviewDom( node, opts, buildAjaxLink, {
				  editor        : editor
				, getPos        : getPos
				, options       : options
				, buildAdminLink: buildAdminLink
				// presideImage only, and only when editable and not opted out
				// (defaultConfigs.imageTools = false).
				, imageTools    : !!( opts.resizable && deps.imageTools !== false && editor.isEditable )
			} );
		},

		addCommands() {
			const name    = opts.name;
			const options = this.options;
			const commands = {};

			commands[ opts.insertCmd ] = ( raw ) => ( { chain } ) =>
				chain().focus().insertContent( { type: name, attrs: { raw: raw } } ).run();

			commands[ opts.openCmd ] = () => ( { editor } ) => {
				openEmbedPicker( editor, opts, options, buildAdminLink ); // insert (no editRaw)
				return true;
			};

			return commands;
		}
	} );
}

function makePreviewDom( node, opts, buildAjaxLink, edit ) {
	const dom = document.createElement( opts.block ? "div" : "span" );
	dom.className = opts.cssClass;
	dom.setAttribute( "contenteditable", "false" );
	dom.title = t( "embed.edithint" );

	// The server-rendered preview gets its own child so chrome drawn over it (the
	// image tools' handles / bubble / refresh button) can be a sibling rather than
	// something the next innerHTML wipes out. `frame` is the shrink-wrapping
	// position:relative box those absolutely-positioned overlays measure against.
	const frame = document.createElement( opts.block ? "div" : "span" );
	frame.className = "tiptap-embed-frame";
	const preview = document.createElement( opts.block ? "div" : "span" );
	preview.className = "tiptap-embed-preview";
	frame.appendChild( preview );
	dom.appendChild( frame );

	function openPicker() {
		if ( typeof edit.getPos === "function" ) { edit.editor.chain().setNodeSelection( edit.getPos() ).run(); }
		openEmbedPicker( edit.editor, opts, edit.options, edit.buildAdminLink, node.attrs.raw );
	}

	// Double-click → select this node + open its picker pre-populated for editing.
	if ( edit && edit.editor ) {
		dom.addEventListener( "dblclick", function( e ) {
			e.preventDefault(); e.stopPropagation();
			openPicker();
		} );
	}

	function loadPreview() {
		const req = opts.previewReq( node.attrs.raw, buildAjaxLink );
		dom.classList.add( "loading" );
		dom.classList.remove( "error" );
		preview.textContent = opts.loadingLabel( node.attrs.raw );

		return postForm( req.url, req.data )
			.then( r => r.text() )
			.then( function( html ) {
				dom.classList.remove( "loading" );
				preview.innerHTML = html;
				if ( tools ) { tools.previewLoaded(); }
			} )
			.catch( function() {
				dom.classList.remove( "loading" );
				dom.classList.add( "error" );
				preview.textContent = t( "embed.error" );
			} );
	}

	const tools = edit.imageTools ? attachImageTools( {
		  dom          : dom
		, frame        : frame
		, preview      : preview
		, node         : node
		, editor       : edit.editor
		, getPos       : edit.getPos
		, buildAjaxLink: buildAjaxLink
		, refresh      : loadPreview
		, openPicker   : openPicker
	} ) : null;

	loadPreview();

	return {
		  dom: dom
		// Without an update() ProseMirror destroys and rebuilds the node view on
		// every attribute change — which would re-request the preview (and so make
		// Preside generate a derivative) on every single resize commit. Keep the DOM,
		// and only re-request when something the SERVER renders differently changed:
		// the image tools report a geometry-only change as handled.
		, update: function( newNode ) {
			if ( newNode.type.name !== node.type.name ) { return false; }

			const rawChanged = newNode.attrs.raw !== node.attrs.raw;
			const handled    = tools ? tools.update( newNode ) : false;
			node = newNode;

			if ( rawChanged && !handled ) { loadPreview(); }
			return true;
		  }
		, selectNode  : function() { dom.classList.add( "ProseMirror-selectednode" ); if ( tools ) { tools.selectNode(); } }
		, deselectNode: function() { dom.classList.remove( "ProseMirror-selectednode" ); if ( tools ) { tools.deselectNode(); } }
		// Let ProseMirror keep handling clicks on the image itself (that is what
		// selects the node), but keep its hands off our own controls.
		, stopEvent   : function( e ) { return tools ? tools.ownsEvent( e ) : false; }
	};
}

function openEmbedPicker( editor, opts, options, buildAdminLink, editRaw ) {
	const editing = !!editRaw;
	openPickerModal( {
		  title       : t( opts.titleKey )
		, editor      : editor
		, url         : opts.pickerUrl( buildAdminLink, options )
		, prefillData : ( editing && opts.prefill ) ? opts.prefill( editRaw ) : null
		, storeUrl    : buildAdminLink( "ajaxhelper.temporarilyStoreData" )
		, onCommit    : function( raw ) {
			if ( editing ) { editor.chain().focus().updateAttributes( opts.name, { raw: raw } ).run(); } // edit in place
			else { editor.commands[ opts.insertCmd ]( raw ); }
		  }
	} );
}

function inner( raw, re ) { const m = String( raw || "" ).match( re ); return m ? m[ 1 ] : ""; }

const WIDGET_RE = /{{widget:([a-zA-Z\$_][a-zA-Z0-9\$_]*):([\s\S]*?):widget}}/;

// ---- Public creators --------------------------------------------------------

export function createPresideImage( deps ) {
	return makeEmbedNode( {
		  name        : "presideImage"
		, block       : true
		, resizable   : true   // drag handles + alignment bubble (src/imageTools.js)
		, dataAttr    : "data-preside-image"
		, cssClass    : "img-placeholder"
		, titleKey    : "picker.image.title"
		, insertCmd   : "insertPresideImage"
		, openCmd     : "openPresideImagePicker"
		, loadingLabel: () => t( "embed.loading.image" )
		, previewReq  : ( raw, buildAjaxLink ) => ( { url: buildAjaxLink( "assetManager.renderEmbeddedImageForEditor" ), data: { embeddedImage: raw } } )
		, pickerUrl   : ( buildAdminLink ) => buildAdminLink( "assetmanager", "pickerForEditorDialog", { type: "image" } )
		, prefill     : ( raw ) => ( { configJson: inner( raw, /^\{\{image:(.*):image\}\}$/ ) } )
	}, deps || {} );
}

export function createPresideAttachment( deps ) {
	return makeEmbedNode( {
		  name        : "presideAttachment"
		, block       : true
		, dataAttr    : "data-preside-attachment"
		, cssClass    : "attachment-placeholder"
		, titleKey    : "picker.attachment.title"
		, insertCmd   : "insertPresideAttachment"
		, openCmd     : "openPresideAttachmentPicker"
		, loadingLabel: () => t( "embed.loading.attachment" )
		, previewReq  : ( raw, buildAjaxLink ) => ( { url: buildAjaxLink( "assetManager.renderEmbeddedAttachmentForEditor" ), data: { embeddedAttachment: raw } } )
		, pickerUrl   : ( buildAdminLink ) => buildAdminLink( "assetmanager", "pickerForEditorDialog", { type: "attachment" } )
		, prefill     : ( raw ) => ( { configJson: inner( raw, /^\{\{attachment:(.*):attachment\}\}$/ ) } )
	}, deps || {} );
}

export function createPresideWidget( deps ) {
	return makeEmbedNode( {
		  name        : "presideWidget"
		, block       : true
		, dataAttr    : "data-preside-widget"
		, cssClass    : "widget-placeholder"
		, titleKey    : "picker.widget.title"
		, insertCmd   : "insertPresideWidget"
		, openCmd     : "openPresideWidgetPicker"
		, loadingLabel: ( raw ) => { const m = raw && raw.match( WIDGET_RE ); return m ? m[ 1 ] : "widget"; }
		, previewReq  : ( raw, buildAjaxLink ) => {
			const m = raw && raw.match( WIDGET_RE );
			return { url: buildAjaxLink( "widgets.renderWidgetPlaceholder" ), data: { widgetId: m ? m[ 1 ] : "", data: m ? m[ 2 ] : "" } };
		  }
		, pickerUrl   : ( buildAdminLink, options ) => buildAdminLink( "widgets", "dialog", { widgetCategories: options.widgetCategories || "", linkPickerCategory: options.linkPickerCategory || "" } )
		, prefill     : ( raw ) => { const m = String( raw || "" ).match( WIDGET_RE ); return { widget: m ? m[ 1 ] : "", configJson: m ? m[ 2 ] : "" }; }
	}, deps || {} );
}
