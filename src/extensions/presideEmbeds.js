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
 */
import { Node } from "@tiptap/core";
import { openPickerModal, postForm } from "../presidePickerModal.js";
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
			return ( { editor, node, getPos } ) => makePreviewDom( node, opts, buildAjaxLink, { editor: editor, getPos: getPos, options: options, buildAdminLink: buildAdminLink } );
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
	dom.className = opts.cssClass + " loading";
	dom.setAttribute( "contenteditable", "false" );
	dom.title = t( "embed.edithint" );
	dom.textContent = opts.loadingLabel( node.attrs.raw );

	// Double-click → select this node + open its picker pre-populated for editing.
	if ( edit && edit.editor ) {
		dom.addEventListener( "dblclick", function( e ) {
			e.preventDefault(); e.stopPropagation();
			if ( typeof edit.getPos === "function" ) { edit.editor.chain().setNodeSelection( edit.getPos() ).run(); }
			openEmbedPicker( edit.editor, opts, edit.options, edit.buildAdminLink, node.attrs.raw );
		} );
	}

	const req = opts.previewReq( node.attrs.raw, buildAjaxLink );
	postForm( req.url, req.data )
		.then( r => r.text() )
		.then( html => { dom.classList.remove( "loading" ); dom.innerHTML = html; } )
		.catch( () => { dom.classList.remove( "loading" ); dom.classList.add( "error" ); dom.textContent = t( "embed.error" ); } );

	return { dom: dom };
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
