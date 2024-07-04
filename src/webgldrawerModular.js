
/*
 * OpenSeadragon - WebGLDrawer
 *
 * Copyright (C) 2009 CodePlex Foundation
 * Copyright (C) 2010-2024 OpenSeadragon contributors
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * - Redistributions of source code must retain the above copyright notice,
 *   this list of conditions and the following disclaimer.
 *
 * - Redistributions in binary form must reproduce the above copyright
 *   notice, this list of conditions and the following disclaimer in the
 *   documentation and/or other materials provided with the distribution.
 *
 * - Neither the name of CodePlex Foundation nor the names of its
 *   contributors may be used to endorse or promote products derived from
 *   this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

(function( $ ){

    const OpenSeadragon = $; // alias for JSDoc

   /**
    * @class OpenSeadragon.WebGLDrawer
    * @classdesc Default implementation of WebGLDrawer for an {@link OpenSeadragon.Viewer}. The WebGLDrawer
    * loads tile data as textures to the graphics card as soon as it is available (via the tile-ready event),
    * and unloads the data (via the image-unloaded event). The drawer utilizes a context-dependent two pass drawing pipeline.
    * For the first pass, tile composition for a given TiledImage is always done using a canvas with a WebGL context.
    * This allows tiles to be stitched together without seams or artifacts, without requiring a tile source with overlap. If overlap is present,
    * overlapping pixels are discarded. The second pass copies all pixel data from the WebGL context onto an output canvas
    * with a Context2d context. This allows applications to have access to pixel data and other functionality provided by
    * Context2d, regardless of whether the CanvasDrawer or the WebGLDrawer is used. Certain options, including compositeOperation,
    * clip, croppingPolygons, and debugMode are implemented using Context2d operations; in these scenarios, each TiledImage is
    * drawn onto the output canvas immediately after the tile composition step (pass 1). Otherwise, for efficiency, all TiledImages
    * are copied over to the output canvas at once, after all tiles have been composited for all images.
    * @param {Object} options - Options for this Drawer.
    * @param {OpenSeadragon.Viewer} options.viewer - The Viewer that owns this Drawer.
    * @param {OpenSeadragon.Viewport} options.viewport - Reference to Viewer viewport.
    * @param {Element} options.element - Parent element.
    * @param {[String]} [options.debugGridColor] - See debugGridColor in {@link OpenSeadragon.Options} for details.
    */

    OpenSeadragon.WebGLDrawerModular = class WebGLDrawer extends OpenSeadragon.DrawerBase{
        constructor(options){
            console.log('Robim moju implementaciu, options =', options);
            console.log('Robim moju implementaciu, extendnute options =', options);
            super(options);

            /**
             * The HTML element (canvas) that this drawer uses for drawing
             * @member {Element} canvas
             * @memberof OpenSeadragon.WebGLDrawer#
             */

            /**
             * The parent element of this Drawer instance, passed in when the Drawer was created.
             * The parent of {@link OpenSeadragon.WebGLDrawer#canvas}.
             * @member {Element} container
             * @memberof OpenSeadragon.WebGLDrawer#
             */

            // private members
            this._destroyed = false;
            this._TextureMap = new Map();
            this._TileMap = new Map(); //unused

            this._outputCanvas = null;
            this._outputContext = null;
            this._clippingCanvas = null;
            this._clippingContext = null;
            this._renderingCanvas = null;
            this._gl = null;
            this._renderingCanvasHasImageData = false;

            this._backupCanvasDrawer = null;
            this.context = this._outputContext; // API required by tests

            /***** SETUP RENDERER *****/
            const rendererOptions = {
                uniqueId: "openseadragon", //todo OSD creates multiple drawers - navigator + main + possibly other - find way to differentiate
                webglPreferredVersion: "2.0",
                webglOptions: {},
                canvasOptions: {
                    stencil: true
                },
                htmlControlsId: null,
                htmlShaderPartHeader: (html, dataId, isVisible, layer, isControllable = true) => {
                    return `<div class="configurable-border"><div class="shader-part-name">${dataId}</div>${html}</div>`;
                },
                ready: () => { },
                resetCallback: function() { },
                debug: false
            };
            // OLD $.extend(this.options, rendererOptions) [this.options are options.options from DRAWERBASE]
            this.renderer = new $.WebGLModule(rendererOptions);

            // this._setupRenderer(); TREBA CEKNUT CI SA NASTAVUJE RENDERER SAM ALE MYSLIM ZE HEJ...
            // spusta velky build rendereru s default specifikaciou
            this.renderer._createSinglePassShader('TEXTURE_2D');

            /* returns $.Point */
            // const size = this._calculateCanvasSize();
            console.log('Som v konstruktori draweru, renderer canvasu a this._size nastavujem na', this.canvas.width, this.canvas.height);
            this.renderer.init(this.canvas.width, this.canvas.height);
            this._size = new $.Point(this.canvas.width, this.canvas.height); // current viewport size, changed during resize event

            this.renderer.setDataBlendingEnabled(true); // enable blending


            /***** SETUP CANVASES *****/
            this._setupCanvases();

            this._renderOffScreenTextures = []; // textures to render into instead of canvas
            this._offScreenTexturesInfo = { // how many textures in _renderOffScreenTextures have correctly set their size to textureSize
                initialized: 0,
                textureSize: new $.Point(0, 0)
            };
            this._renderOffScreenBuffer = this._gl.createFramebuffer(); // buffer to be used with any texture from _renderOffScreenTextures

            console.log('V konstruktori draweru, po inicializacii je renderer =', this.renderer);


            // disable cull face, this solved flipping error
            this._gl.disable(this._gl.CULL_FACE);

            /***** EVENT HANDLERS *****/
            // Add listeners for events that require modifying the scene or camera
            this._boundToTileReady = ev => this._tileReadyHandler(ev);
            this._boundToImageUnloaded = ev => {
                this._cleanupImageData(ev.context2D.canvas);
            };
            this.viewer.addHandler("tile-ready", this._boundToTileReady);
            this.viewer.addHandler("image-unloaded", this._boundToImageUnloaded);

            // Reject listening for the tile-drawing and tile-drawn events, which this drawer does not fire
            this.viewer.rejectEventHandler("tile-drawn", "The WebGLDrawer does not raise the tile-drawn event");
            this.viewer.rejectEventHandler("tile-drawing", "The WebGLDrawer does not raise the tile-drawing event");

            /* Pridane event handlery z draweru */
            this.viewer.world.addHandler("add-item", (e) => {
                //todo: use this.renderer.uniqueId to set rendering targets
                console.log('ADD-ITEM EVENT !!!');
                let shader = e.item.source.shader;
                if (shader) {
                    if (Number.isInteger(shader._programIndexTarget)) {
                        return; //already configured, multiple drawers
                    }
                    const targetIndex = this.renderer.getSpecificationsCount();
                    if (this.renderer.addRenderingSpecifications(shader)) {
                        this.renderer.buildProgram(targetIndex, null, true, this.renderer.buildOptions);
                        shader._programIndexTarget = targetIndex;
                        return;
                    }
                } else {
                    e.item.source.shader = shader = this.renderer.defaultRenderingSpecification;
                }
                //set default program: identity
                shader._programIndexTarget = 0;
            });

            this.viewer.world.addHandler("remove-item", (e) => {
                console.log('REMOVE-ITEM EVENT !!!');
                const tIndex = e.item.source.shader._programIndexTarget;
                if (tIndex > 0) {
                    this.renderer.setRenderingSpecification(tIndex, null);
                    this.renderer.deleteProgram(tIndex);
                }
            });


            /** Skusam firstPass program spravit **/
            const vertexShaderSourceFirstPass = `
    precision mediump float;

    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    uniform mat3 u_transform_matrix;

    void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(u_transform_matrix * vec3(a_position, 1), 1);
    }
`;
            const fragmentShaderSourceFirstPass = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;

    void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
    }
`;
            this.vertexShaderFirstPass = this.__createShader(this._gl, this._gl.VERTEX_SHADER, vertexShaderSourceFirstPass);
            if (!this.vertexShaderFirstPass) {
                alert("Creation of first pass vertex shader failed");
            }
            this.fragmentShaderFirstPass = this.__createShader(this._gl, this._gl.FRAGMENT_SHADER, fragmentShaderSourceFirstPass);
            if (!this.fragmentShaderFirstPass) {
                alert("Creation of first pass fragment shader failed");
            }
            this.programFirstPass = this.__createProgram(this._gl, this.vertexShaderFirstPass, this.fragmentShaderFirstPass);
            if (!this.programFirstPass) {
                alert("Creation of first pass program failed");
            }

            /** Skusam secondPass program spravit **/
            const vertexShaderSourceSecondPass = `
    attribute vec2 a_positionn;
    attribute vec2 a_texCoords;
    varying vec2 v_texcoord;

    void main() {
        // convert from 0->1 to 0->2
        vec2 zeroToTwo = a_positionn * 2.0;

        // convert from 0->2 to -1->+1 (clipspace)
        vec2 clipSpace = zeroToTwo - 1.0;

        // original was gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
        // but because texture from first pass comes flipped over x-axis I use this:
        gl_Position = vec4(clipSpace * vec2(1, 1), 0, 1);

        v_texcoord = a_texCoords;
    }
`;
            const fragmentShaderSourceSecondPass = `
    precision mediump float;

    varying vec2 v_texcoord;
    uniform sampler2D u_texture;

    void main() {
        gl_FragColor = texture2D(u_texture, v_texcoord);
        //gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
    }
`;
            this.vertexShaderSecondPass = this.__createShader(this._gl, this._gl.VERTEX_SHADER, vertexShaderSourceSecondPass);
            if (!this.vertexShaderSecondPass) {
                alert("Creation of vertex shader failed");
            }
            this.fragmentShaderSecondPass = this.__createShader(this._gl, this._gl.FRAGMENT_SHADER, fragmentShaderSourceSecondPass);
            if (!this.fragmentShaderSecondPass) {
                alert("Creation of fragment shader failed");
            }
            this.programSecondPass = this.__createProgram(this._gl, this.vertexShaderSecondPass, this.fragmentShaderSecondPass);
            if (!this.programSecondPass) {
                alert("Creation of program failed");
            }

            /** Skusam first+second pass program spravit **/
            const vertexShaderSourceEZ = `
    precision mediump float;

    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    uniform int u_pass;
    uniform mat3 u_transform_matrix;

    void main() {
        v_texCoord = a_texCoord;

        if (u_pass == 1) {
            gl_Position = vec4(u_transform_matrix * vec3(a_position, 1), 1);
        } else {
            // convert from 0->1 to 0->2
            vec2 oneToTwo = a_position * 2.0;

            // convert from 0->2 to -1->+1 (clipSpace coordinates)
            vec2 clipSpace = oneToTwo - 1.0;

            gl_Position = vec4(clipSpace, 1, 1);
        }
    }
`;
            const fragmentShaderSourceEZ = `
    precision mediump float;
    precision mediump sampler2D;

    varying vec2 v_texCoord;
    uniform sampler2D u_texture;

    void main() {
        gl_FragColor = texture2D(u_texture, v_texCoord);
    }
`;
            this.vertexShaderEZ = this.__createShader(this._gl, this._gl.VERTEX_SHADER, vertexShaderSourceEZ);
            if (!this.vertexShaderEZ) {
                alert("Creation of vertex shader failed");
            }
            this.fragmentShaderEZ = this.__createShader(this._gl, this._gl.FRAGMENT_SHADER, fragmentShaderSourceEZ);
            if (!this.fragmentShaderEZ) {
                alert("Creation of fragment shader failed");
            }
            this.programEZ = this.__createProgram(this._gl, this.vertexShaderEZ, this.fragmentShaderEZ);
            if (!this.programEZ) {
                alert("Creation of program failed");
            }

            const gl = this._gl;
            gl.useProgram(this.programEZ);
            this.programEZData = {
                positionBuffer: gl.createBuffer(),
                positionLocation: gl.getAttribLocation(this.programEZ, "a_position"),
                texCoordBuffer: gl.createBuffer(),
                texCoordLocation: gl.getAttribLocation(this.programEZ, "a_texCoord"),
                matrixLocation: gl.getUniformLocation(this.programEZ, "u_transform_matrix"),
                passLocation: gl.getUniformLocation(this.programEZ, "u_pass"),
                textureLocation: gl.getUniformLocation(this.programEZ, "u_texture")
            };
            gl.enableVertexAttribArray(this.programEZData.texCoordLocation);

            // OPTIMALIZATION - fill buffer with initial thrash and call vertexAttribPointer to tell WebGL how to read from the buffer,
            //                  later there's no need to call vertexAttribPointer repeatedly during drawing
            gl.bindBuffer(gl.ARRAY_BUFFER, this.programEZData.positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this.programEZData.positionLocation);
            gl.vertexAttribPointer(this.programEZData.positionLocation, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.programEZData.texCoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this.programEZData.texCoordLocation);
            gl.vertexAttribPointer(this.programEZData.texCoordLocation, 2, gl.FLOAT, false, 0, 0);

            // texture unit setup
            // This line sets the value of the uniform u_texture to 0. This tells the shader that u_texture corresponds to texture unit 0.
            gl.uniform1i(this.programEZData.textureLocation, 0);
            // This line activates texture unit 0. WebGL supports multiple texture units (e.g., gl.TEXTURE0, gl.TEXTURE1, etc.), allowing you to use multiple textures in a single shader.
            gl.activeTexture(gl.TEXTURE0);

            // This last line is later called during drawing process to switch between textures.
            // This line binds the texture to the TEXTURE_2D target of the currently active texture unit (which is texture unit 0).
            // gl.bindTexture(gl.TEXTURE_2D, texture);





        }//end of constructor


        // Public API required by all Drawer implementations
        /**
        * Clean up the renderer, removing all resources
        */
        destroy() {
            console.log('Drawer::destroy() function is being called.');
            if (this._destroyed) {
                return;
            }
            const gl = this._gl;

            // adapted from https://stackoverflow.com/a/23606581/1214731
            var numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
            for (let unit = 0; unit < numTextureUnits; ++unit) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, null);
                gl.bindTexture(gl.TEXTURE_CUBE_MAP, null); //unused
            }
            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null); //unused
            gl.bindRenderbuffer(gl.RENDERBUFFER, null); //unused
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            // Delete all our created resources
            let canvases = Array.from(this._TextureMap.keys());
            canvases.forEach(canvas => {
                this._cleanupImageData(canvas); // deletes texture, removes from _TextureMap
            });

            // from drawer
            this._renderOffScreenTextures.forEach(t => {
                if (t) {
                    gl.deleteTexture(t);
                }
            });
            this._renderOffScreenTextures = [];

            if (this._renderOffScreenBuffer) {
                gl.deleteFramebuffer(this._renderOffScreenBuffer);
                this._renderOffScreenBuffer = null;
            }

            // make canvases 1 x 1 px and delete references
            this._clippingCanvas.width = this._clippingCanvas.height = 1;
            this._outputCanvas.width = this._outputCanvas.height = 1;
            this._renderingCanvas.width = this._renderingCanvas.height = 1;
            this._clippingCanvas = this._clippingContext = null;
            this._outputCanvas = this._outputContext = null;
            this._renderingCanvas = null;

            let ext = gl.getExtension('WEBGL_lose_context');
            if (ext) {
                ext.loseContext();
            }

            // unbind our event listeners from the viewer
            this.viewer.removeHandler("tile-ready", this._boundToTileReady);
            this.viewer.removeHandler("image-unloaded", this._boundToImageUnloaded);

            if(this._backupCanvasDrawer){
                this._backupCanvasDrawer.destroy();
                this._backupCanvasDrawer = null;
            }

            this.container.removeChild(this.canvas);
            if(this.viewer.drawer === this){
                this.viewer.drawer = null;
            }

            // set our webgl context reference to null to enable garbage collection
            this._gl = null;
            // set our destroyed flag to true
            this._destroyed = true;
        }

        // Public API required by all Drawer implementations
        /**
        *
        * @returns {Boolean} true
        */
        canRotate() {
            return true;
        }

        // Public API required by all Drawer implementations
        /**
        * @returns {Boolean} true if canvas and webgl are supported
        */
        static isSupported() {
            let canvasElement = document.createElement('canvas');
            let webglContext = $.isFunction(canvasElement.getContext) &&
                        canvasElement.getContext('webgl');
            let ext = webglContext.getExtension('WEBGL_lose_context');
            if (ext) {
                ext.loseContext();
            }
            return !!(webglContext);
        }

        /**
         * Drawer type.
         * @returns 'webgl' [should return at least]
         */
        getType() {
            return 'myImplementation';
        }

        /**
         * Creates an HTML element into which will be drawn.
         * @private
         * @returns {HTMLCanvasElement} the canvas to draw into
         */
        _createDrawingElement() {
            let canvas = $.makeNeutralElement("canvas");
            let viewportSize = this._calculateCanvasSize();
            canvas.width = viewportSize.x;
            canvas.height = viewportSize.y;
            return canvas;
        }

        /**
         * Get the backup renderer (CanvasDrawer) to use if data cannot be used by webgl
         * Lazy loaded
         * @private
         * @returns {CanvasDrawer}
         */
        _getBackupCanvasDrawer(){
            if(!this._backupCanvasDrawer){
                this._backupCanvasDrawer = this.viewer.requestDrawer('canvas', {mainDrawer: false});
                this._backupCanvasDrawer.canvas.style.setProperty('visibility', 'hidden');
            }

            return this._backupCanvasDrawer;
        }

        /**
        *
        * @param {Array} tiledImages Array of TiledImage objects to draw
        */
        draw(tiledImages) {
            // clear the output canvas
            this._outputContext.clearRect(0, 0, this._outputCanvas.width, this._outputCanvas.height);

            let view = {
                bounds: this.viewport.getBoundsNoRotate(true),
                center: this.viewport.getCenter(true),
                rotation: this.viewport.getRotation(true) * Math.PI / 180,
                zoom: this.viewport.getZoom(true) //nove
            };

            // calculate view matrix for viewer
            let flipMultiplier = this.viewport.flipped ? -1 : 1;
            let posMatrix = $.Mat3.makeTranslation(-view.center.x, -view.center.y);
            let scaleMatrix = $.Mat3.makeScaling(2 / view.bounds.width * flipMultiplier, -2 / view.bounds.height);
            let rotMatrix = $.Mat3.makeRotation(-view.rotation);
            let viewMatrix = scaleMatrix.multiply(rotMatrix).multiply(posMatrix);

            // const gl = this._gl;
            let twoPassRendering = true;
            // skusit proste premazat cervenou
            if (twoPassRendering) {
                this.enableStencilTest(false);
                this._resizeOffScreenTextures(tiledImages.length);
                console.log('Draw CALL with predefined tiledImages array.');
                this._drawTwoPassEZ(tiledImages, view, viewMatrix);
            } else {
                this.enableStencilTest(false);
                // this._resizeOffScreenTextures(tiledImages.length); podla mna to je zbytocne, naco su mi offscreentextury vo first passe?
                this._drawSinglePass(tiledImages, view, viewMatrix);
            }

            /* context2dPipeline was not used, data are still in _renderingCanvas */
            if (this._renderingCanvasHasImageData) {
                this._outputContext.drawImage(this._renderingCanvas, 0, 0);
            }
        }//end of draw function

        /**
         * Initial setup of all three canvases (output, clipping, rendering) and their contexts (2d, 2d, webgl) + resize event handler registration
         */
        _setupCanvases() {
            this._outputCanvas = this.canvas; //canvas on screen
            this._outputContext = this._outputCanvas.getContext('2d');

            this._renderingCanvas = this.renderer.canvas; //canvas for webgl
            this._gl = this.renderer.gl;

            this._clippingCanvas = document.createElement('canvas'); //canvas for clipping and cropping
            this._clippingContext = this._clippingCanvas.getContext('2d');

            this._renderingCanvas.width = this._clippingCanvas.width = this._outputCanvas.width;
            this._renderingCanvas.height = this._clippingCanvas.height = this._outputCanvas.height;

            this._registerResizeEventHandler();
        }

        // nemenil som
        _calculateOverlapFraction(tile, tiledImage) {
            let overlap = tiledImage.source.tileOverlap;
            let nativeWidth = tile.sourceBounds.width; // in pixels
            let nativeHeight = tile.sourceBounds.height; // in pixels
            let overlapWidth  = (tile.x === 0 ? 0 : overlap) + (tile.isRightMost ? 0 : overlap); // in pixels
            let overlapHeight = (tile.y === 0 ? 0 : overlap) + (tile.isBottomMost ? 0 : overlap); // in pixels
            let widthOverlapFraction = overlap / (nativeWidth + overlapWidth); // as a fraction of image including overlap
            let heightOverlapFraction = overlap / (nativeHeight + overlapHeight); // as a fraction of image including overlap
            return {
                x: widthOverlapFraction,
                y: heightOverlapFraction
            };
        }

        /* Removes tileCanvas from texture map + free texture from GPU,
            called from destroy and when image-unloaded event happens */
        _cleanupImageData(tileCanvas) {
            let textureInfo = this._TextureMap.get(tileCanvas);
            //remove from the map
            this._TextureMap.delete(tileCanvas);

            //release the texture from the GPU
            if(textureInfo){
                this._gl.deleteTexture(textureInfo.texture);
            }
        }


        /* Context2DPipeline functions ------------------------------------------------------------------------------------------------------------------ */
        /**
        * Draw data from the rendering canvas onto the output canvas, with clipping,
        * cropping and/or debug info as requested.
        * @private
        * @param {OpenSeadragon.TiledImage} tiledImage - the tiledImage to draw
        * @param {Array} tilesToDraw - array of objects containing tiles that were drawn
        */
        _applyContext2dPipeline(tiledImage, tilesToDraw, tiledImageIndex) {
            // composite onto the output canvas, clipping if necessary
            this._outputContext.save();

            // set composite operation; ignore for first image drawn
            this._outputContext.globalCompositeOperation = tiledImageIndex === 0 ? null : tiledImage.compositeOperation || this.viewer.compositeOperation;
            if(tiledImage._croppingPolygons || tiledImage._clip){
                this._renderToClippingCanvas(tiledImage);
                this._outputContext.drawImage(this._clippingCanvas, 0, 0);

            } else {
                this._outputContext.drawImage(this._renderingCanvas, 0, 0);
            }
            this._outputContext.restore();
            if(tiledImage.debugMode){
                let colorIndex = this.viewer.world.getIndexOfItem(tiledImage) % this.debugGridColor.length;
                let strokeStyle = this.debugGridColor[colorIndex];
                let fillStyle = this.debugGridColor[colorIndex];
                this._drawDebugInfo(tilesToDraw, tiledImage, strokeStyle, fillStyle);
            }
        }

        _setClip(){
            // no-op: called by _renderToClippingCanvas when tiledImage._clip is truthy
            // so that tests will pass.
        }

        _renderToClippingCanvas(item){

            this._clippingContext.clearRect(0, 0, this._clippingCanvas.width, this._clippingCanvas.height);
            this._clippingContext.save();
            if(this.viewer.viewport.getFlip()){
                const point = new $.Point(this.canvas.width / 2, this.canvas.height / 2);
                this._clippingContext.translate(point.x, 0);
                this._clippingContext.scale(-1, 1);
                this._clippingContext.translate(-point.x, 0);
            }

            if(item._clip){
                const polygon = [
                    {x: item._clip.x, y: item._clip.y},
                    {x: item._clip.x + item._clip.width, y: item._clip.y},
                    {x: item._clip.x + item._clip.width, y: item._clip.y + item._clip.height},
                    {x: item._clip.x, y: item._clip.y + item._clip.height},
                ];
                let clipPoints = polygon.map(coord => {
                    let point = item.imageToViewportCoordinates(coord.x, coord.y, true)
                        .rotate(this.viewer.viewport.getRotation(true), this.viewer.viewport.getCenter(true));
                    let clipPoint = this.viewportCoordToDrawerCoord(point);
                    return clipPoint;
                });
                this._clippingContext.beginPath();
                clipPoints.forEach( (coord, i) => {
                    this._clippingContext[i === 0 ? 'moveTo' : 'lineTo'](coord.x, coord.y);
                });
                this._clippingContext.clip();
                this._setClip();
            }
            if(item._croppingPolygons){
                let polygons = item._croppingPolygons.map(polygon => {
                    return polygon.map(coord => {
                        let point = item.imageToViewportCoordinates(coord.x, coord.y, true)
                            .rotate(this.viewer.viewport.getRotation(true), this.viewer.viewport.getCenter(true));
                        let clipPoint = this.viewportCoordToDrawerCoord(point);
                        return clipPoint;
                    });
                });
                this._clippingContext.beginPath();
                polygons.forEach((polygon) => {
                    polygon.forEach( (coord, i) => {
                        this._clippingContext[i === 0 ? 'moveTo' : 'lineTo'](coord.x, coord.y);
                    });
                });
                this._clippingContext.clip();
            }

            if(this.viewer.viewport.getFlip()){
                const point = new $.Point(this.canvas.width / 2, this.canvas.height / 2);
                this._clippingContext.translate(point.x, 0);
                this._clippingContext.scale(-1, 1);
                this._clippingContext.translate(-point.x, 0);
            }

            this._clippingContext.drawImage(this._renderingCanvas, 0, 0);

            this._clippingContext.restore();
        }

        _offsetForRotation(options) {
            var point = options.point ?
                options.point.times($.pixelDensityRatio) :
                new $.Point(this._outputCanvas.width / 2, this._outputCanvas.height / 2);

            var context = this._outputContext;
            context.save();

            context.translate(point.x, point.y);
            if (this.viewport.flipped) {
                context.rotate(Math.PI / 180 * -options.degrees);
                context.scale(-1, 1);
            } else {
                context.rotate(Math.PI / 180 * options.degrees);
            }
            context.translate(-point.x, -point.y);
        }

        _drawDebugInfo( tilesToDraw, tiledImage, stroke, fill ) {

            for ( var i = tilesToDraw.length - 1; i >= 0; i-- ) {
                var tile = tilesToDraw[ i ].tile;
                try {
                    this._drawDebugInfoOnTile(tile, tilesToDraw.length, i, tiledImage, stroke, fill);
                } catch(e) {
                    $.console.error(e);
                }
            }
        }

        _drawDebugInfoOnTile(tile, count, i, tiledImage, stroke, fill) {

            var context = this._outputContext;
            context.save();
            context.lineWidth = 2 * $.pixelDensityRatio;
            context.font = 'small-caps bold ' + (13 * $.pixelDensityRatio) + 'px arial';
            context.strokeStyle = stroke;
            context.fillStyle = fill;

            if (this.viewport.getRotation(true) % 360 !== 0 ) {
                this._offsetForRotation({degrees: this.viewport.getRotation(true)});
            }
            if (tiledImage.getRotation(true) % 360 !== 0) {
                this._offsetForRotation({
                    degrees: tiledImage.getRotation(true),
                    point: tiledImage.viewport.pixelFromPointNoRotate(
                        tiledImage._getRotationPoint(true), true)
                });
            }
            if (tiledImage.viewport.getRotation(true) % 360 === 0 &&
                tiledImage.getRotation(true) % 360 === 0) {
                if(tiledImage._drawer.viewer.viewport.getFlip()) {
                    tiledImage._drawer._flip();
                }
            }

            context.strokeRect(
                tile.position.x * $.pixelDensityRatio,
                tile.position.y * $.pixelDensityRatio,
                tile.size.x * $.pixelDensityRatio,
                tile.size.y * $.pixelDensityRatio
            );

            var tileCenterX = (tile.position.x + (tile.size.x / 2)) * $.pixelDensityRatio;
            var tileCenterY = (tile.position.y + (tile.size.y / 2)) * $.pixelDensityRatio;

            // Rotate the text the right way around.
            context.translate( tileCenterX, tileCenterY );
            context.rotate( Math.PI / 180 * -this.viewport.getRotation(true) );
            context.translate( -tileCenterX, -tileCenterY );

            if( tile.x === 0 && tile.y === 0 ){
                context.fillText(
                    "Zoom: " + this.viewport.getZoom(),
                    tile.position.x * $.pixelDensityRatio,
                    (tile.position.y - 30) * $.pixelDensityRatio
                );
                context.fillText(
                    "Pan: " + this.viewport.getBounds().toString(),
                    tile.position.x * $.pixelDensityRatio,
                    (tile.position.y - 20) * $.pixelDensityRatio
                );
            }
            context.fillText(
                "Level: " + tile.level,
                (tile.position.x + 10) * $.pixelDensityRatio,
                (tile.position.y + 20) * $.pixelDensityRatio
            );
            context.fillText(
                "Column: " + tile.x,
                (tile.position.x + 10) * $.pixelDensityRatio,
                (tile.position.y + 30) * $.pixelDensityRatio
            );
            context.fillText(
                "Row: " + tile.y,
                (tile.position.x + 10) * $.pixelDensityRatio,
                (tile.position.y + 40) * $.pixelDensityRatio
            );
            context.fillText(
                "Order: " + i + " of " + count,
                (tile.position.x + 10) * $.pixelDensityRatio,
                (tile.position.y + 50) * $.pixelDensityRatio
            );
            context.fillText(
                "Size: " + tile.size.toString(),
                (tile.position.x + 10) * $.pixelDensityRatio,
                (tile.position.y + 60) * $.pixelDensityRatio
            );
            context.fillText(
                "Position: " + tile.position.toString(),
                (tile.position.x + 10) * $.pixelDensityRatio,
                (tile.position.y + 70) * $.pixelDensityRatio
            );

            if (this.viewport.getRotation(true) % 360 !== 0 ) {
                this._restoreRotationChanges();
            }
            if (tiledImage.getRotation(true) % 360 !== 0) {
                this._restoreRotationChanges();
            }

            if (tiledImage.viewport.getRotation(true) % 360 === 0 &&
                tiledImage.getRotation(true) % 360 === 0) {
                if(tiledImage._drawer.viewer.viewport.getFlip()) {
                    tiledImage._drawer._flip();
                }
            }

            context.restore();
        }

        _restoreRotationChanges() {
            var context = this._outputContext;
            context.restore();
        }


        /* Event handlers ------------------------------------------------------------------------------------------------------------------ */
        _uploadImageData(tileContext) {
            let gl = this._gl;
            let canvas = tileContext.canvas;

            try{
                if(!canvas){
                    throw('Tile context does not have a canvas', tileContext);
                }
                // This depends on gl.TEXTURE_2D being bound to the texture
                // associated with this canvas before calling this function
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
            } catch (e){
                $.console.error('Error uploading image data to WebGL', e);
            }
        }

        _tileReadyHandler(event) {
            let tile = event.tile;
            let tiledImage = event.tiledImage;

            // If a tiledImage is already known to be tainted, don't try to upload any
            // textures to webgl, because they won't be used even if it succeeds
            if(tiledImage.isTainted()){
                return;
            }

            let tileContext = tile.getCanvasContext();
            let canvas = tileContext && tileContext.canvas;
            // if the tile doesn't provide a canvas, or is tainted by cross-origin
            // data, marked the TiledImage as tainted so the canvas drawer can be
            // used instead, and return immediately - tainted data cannot be uploaded to webgl
            if(!canvas || $.isCanvasTainted(canvas)){
                const wasTainted = tiledImage.isTainted();
                if(!wasTainted){
                    tiledImage.setTainted(true);
                    $.console.warn('WebGL cannot be used to draw this TiledImage because it has tainted data. Does crossOriginPolicy need to be set?');
                    this._raiseDrawerErrorEvent(tiledImage, 'Tainted data cannot be used by the WebGLDrawer. Falling back to CanvasDrawer for this TiledImage.');
                }
                return;
            }

            let textureInfo = this._TextureMap.get(canvas);

            // if this is a new image for us, create a gl Texture for this tile and bind the canvas with the image data
            if(!textureInfo){
                const gl = this._gl;
                let position;
                let overlap = tiledImage.source.tileOverlap;

                // deal with tiles where there is padding, i.e. the pixel data doesn't take up the entire provided canvas
                let sourceWidthFraction, sourceHeightFraction;
                if (tile.sourceBounds) {
                    sourceWidthFraction = Math.min(tile.sourceBounds.width, canvas.width) / canvas.width;
                    sourceHeightFraction = Math.min(tile.sourceBounds.height, canvas.height) / canvas.height;
                } else {
                    sourceWidthFraction = 1;
                    sourceHeightFraction = 1;
                }

                if(overlap > 0){
                    // calculate the normalized position of the rect to actually draw
                    // discarding overlap.
                    let overlapFraction = this._calculateOverlapFraction(tile, tiledImage);

                    let left = (tile.x === 0 ? 0 : overlapFraction.x) * sourceWidthFraction;
                    let top = (tile.y === 0 ? 0 : overlapFraction.y) * sourceHeightFraction;
                    let right = (tile.isRightMost ? 1 : 1 - overlapFraction.x) * sourceWidthFraction;
                    let bottom = (tile.isBottomMost ? 1 : 1 - overlapFraction.y) * sourceHeightFraction;
                    position = new Float32Array([
                        left, bottom,
                        left, top,
                        right, bottom,
                        right, top
                    ]);
                } else {
                    position = new Float32Array([
                        0, sourceHeightFraction,
                        0, 0,
                        sourceWidthFraction, sourceHeightFraction,
                        sourceWidthFraction, 0
                    ]);
                }

                let texture = gl.createTexture();
                let textureInfo = {
                    texture: texture,
                    position: position,
                };

                // add it to our _TextureMap
                this._TextureMap.set(canvas, textureInfo);

                const options = this.renderer.webglContext.options;
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                // Set the parameters so we can render any size image.
                // options.wrap -> gl.MIRRORED_REPEAT
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrap);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrap);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.minFilter);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.magFilter);
                // Upload the image into the texture.
                this._uploadImageData(tileContext);
            }
        }

        /* Old resizeRenderer, MOZNO TREBA DACO SPRAVIT ESTE, neviem co sa tu sibrinkuje s tou texturou... */
        /*
        _resizeRenderer(){
            let gl = this._gl;
            let w = this._renderingCanvas.width;
            let h = this._renderingCanvas.height;
            gl.viewport(0, 0, w, h);

            //release the old texture
            gl.deleteTexture(this._renderToTexture);
            //create a new texture and set it up
            this._renderToTexture = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this._renderToTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

            //bind the frame buffer to the new texture
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFrameBuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._renderToTexture, 0);
        }
        */

        _registerResizeEventHandler() {
            // make the additional canvas elements mirror size changes to the output canvas
            const _this = this;
            this.viewer.addHandler("resize", function() {
                console.log('Resize event');
                if(_this._outputCanvas !== _this.viewer.drawer.canvas){
                    _this._outputCanvas.style.width = _this.viewer.drawer.canvas.clientWidth + 'px';
                    _this._outputCanvas.style.height = _this.viewer.drawer.canvas.clientHeight + 'px';
                }

                let viewportSize = _this._calculateCanvasSize();
                if( _this._outputCanvas.width !== viewportSize.x ||
                    _this._outputCanvas.height !== viewportSize.y ) {
                    _this._outputCanvas.width = viewportSize.x;
                    _this._outputCanvas.height = viewportSize.y;
                }

                _this._renderingCanvas.style.width = _this._outputCanvas.clientWidth + 'px';
                _this._renderingCanvas.style.height = _this._outputCanvas.clientHeight + 'px';
                _this._renderingCanvas.width = _this._clippingCanvas.width = _this._outputCanvas.width;
                _this._renderingCanvas.height = _this._clippingCanvas.height = _this._outputCanvas.height;

                console.log('Resize event, rC.width:rC.height', _this._renderingCanvas.width, _this._renderingCanvas.height);
                // important - update the size of the rendering viewport!
                // _this._resizeRenderer(); OLD WAY
                // NEW WAY
                _this.renderer.setDimensions(0, 0, _this._renderingCanvas.width, _this._renderingCanvas.height);
                _this._size = viewportSize;
            });
        }


        // Public API required by all Drawer implementations
        /**
         * Required by DrawerBase, but has no effect on WebGLDrawer.
         * @param {Boolean} enabled
         */
        setImageSmoothingEnabled(enabled){
            // noop - this property does not impact WebGLDrawer
        } //unused

        /**
         * Draw a rect onto the output canvas for debugging purposes
         * @param {OpenSeadragon.Rect} rect
         */
        drawDebuggingRect(rect){
            let context = this._outputContext;
            context.save();
            context.lineWidth = 2 * $.pixelDensityRatio;
            context.strokeStyle = this.debugGridColor[0];
            context.fillStyle = this.debugGridColor[0];

            context.strokeRect(
                rect.x * $.pixelDensityRatio,
                rect.y * $.pixelDensityRatio,
                rect.width * $.pixelDensityRatio,
                rect.height * $.pixelDensityRatio
            );

            context.restore();
        } //unused

        _getTextureDataFromTile(tile){
            return tile.getCanvasContext().canvas;
        } //unused


        /* NOVE FUNCKIE Z DRAW.JS ------------------------------------------------------------------------------------------------------------------ */
        /**
         * twopass - Enabled, singlepass - Disabled
         * If parameter enabled is true then stencil test, else disable stencil test
         * @param {Boolean} enabled whether enable stencil test or not
         */
        enableStencilTest(enabled) {
            if (enabled) {
                if (!this._stencilTestEnabled) {
                    const gl = this.renderer.gl;
                    gl.enable(gl.STENCIL_TEST);
                    gl.stencilMask(0xff);
                    gl.stencilFunc(gl.GREATER, 1, 0xff);
                    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
                    this._stencilTestEnabled = true;
                }
            } else {
                if (this._stencilTestEnabled) {
                    this._stencilTestEnabled = false;
                    const gl = this.renderer.gl;
                    gl.disable(gl.STENCIL_TEST);
                }
            }
        }

        /* Iba pre singlepass
            returns number probably ? nezistil som co je viewport zoom */
        tiledImageViewportToImageZoom(tiledImage, viewportZoom) {
            var ratio = tiledImage._scaleSpring.current.value *
                tiledImage.viewport._containerInnerSize.x /
                tiledImage.source.dimensions.x;
            return ratio * viewportZoom;
        }

        /** Called only before drawTwoPass() call in draw() function, reinitialize
         * count offScreenTextures to be used as first pass rendering target during
         * twoPass render.
         * @param {number} count number of textures to reinitialize
         */
        _resizeOffScreenTextures(count) {
            if (count < 1) {
                return;
            }

            const gl = this._gl;
            count = Math.min(count, gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
            //append or reinitialize textures
            //const rebuildStartIndex = (this._offScreenTexturesInfo.size !== this._size) ? this._renderOffScreenTextures.length : 0;
            //let i = rebuildStartIndex;
            for (let i = 0; i < count; ++i) {
                // console.log('Pripravujem offscreen texturu cislo', i);
                let texture = this._renderOffScreenTextures[i];
                if (!texture) {
                    this._renderOffScreenTextures[i] = texture = gl.createTexture();
                }
                gl.bindTexture(gl.TEXTURE_2D, texture);

                const x = this._size.x;
                const y = this._size.y;
                const initialData = new Uint8Array(x * y * 4);
                // set initial data as blue pixels everywhere
                // for (let i = 2; i < initialData.length; i += 4) {
                //     initialData[i] = 255;
                //     initialData[i + 1] = 255;
                // }
                // original was internalformat = gl.RGBA8
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
                    x, y, 0, gl.RGBA, gl.UNSIGNED_BYTE, initialData);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
            }

            //destroy any textures that we don't need todo maybe just keep dont bother?
            //for (let j = this._renderOffScreenTextures.length - 1; j >= i; j--) {
                //let texture = this._renderOffScreenTextures.pop();
                //gl.deleteTexture(texture);
            //}
            this._offScreenTexturesInfo.initialized = count;
            this._offScreenTexturesInfo.textureSize = this._size;
        }

        /**
         * Iba pre twopass,
         * Binds _renderOffScreenBuffer to i-th texture from _renderOffScreenTextures
         * @param {number} i index to texture in this._renderOffScreenTextures
         */
        _bindFrameBufferToOffScreenTexture(i) {
            const gl = this._gl;
            let texture = this._renderOffScreenTextures[i];
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._renderOffScreenBuffer);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        }

        /**
         * Iba pre draw funkciu
         * @param {[TiledImage]} tiledImages Array of tiledImage objects to draw
         * @param {Object} viewport has bounds, center, rotation, zoom
         * @param {OpenSeadragon.Mat3} viewMatrix to apply
         */
        _drawSinglePass(tiledImages, viewport, viewMatrix) {
            console.log('Idem drawovat single pass, pocet tiledImages =', tiledImages.length);
            const gl = this._gl;
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.clear(gl.COLOR_BUFFER_BIT);

            tiledImages.forEach((tiledImage, tiledImageIndex) => {
                console.log('Vo for cykli cez tiledImages, TiledImage cislo', tiledImageIndex);

                /* If vetva pridana z merge-u, jemne upravena */
                if(tiledImage.isTainted()){
                    // first, draw any data left in the rendering buffer onto the output canvas
                    if(this._renderingCanvasHasImageData){
                        this._outputContext.drawImage(this._renderingCanvas, 0, 0);
                        this._renderingCanvasHasImageData = false;
                    }

                    // next, use the backup canvas drawer to draw this tainted image
                    const canvasDrawer = this._getBackupCanvasDrawer();
                    canvasDrawer.draw([tiledImage]);
                    this._outputContext.drawImage(canvasDrawer.canvas, 0, 0);
                } else {
                    let tilesToDraw = tiledImage.getTilesToDraw();

                    /* Pridane z merge-u */
                    if ( tiledImage.placeholderFillStyle && tiledImage._hasOpaqueTile === false ) {
                        this._drawPlaceholder(tiledImage);
                    }

                    // nothing to draw or opacity is zero
                    if (tilesToDraw.length === 0 || tiledImage.getOpacity() === 0) {
                        // console.log('Bud neni co kreslit alebo opacity je nula, vyhadzujem sa z tohto tiledImage-u, dovod:', tilesToDraw.length === 0, tiledImage.getOpacity() === 0);
                        return;
                    }

                    //todo better access to the rendering context
                    /* plainshader je konkretna shader instancia (plain shader extends shaderLayer) */
                    const plainShader = this.renderer.getSpecification(0).shaders.renderShader._renderContext;
                    /* bere parameter name, spravi renderer.BLEND_MODE[name], ak to nieje undefined tak nastavi shader.blendMode na to,
                    ak to je undefined tak nastavi shader.blendMode na renderer.BLEND_MODE["source-over"] */
                    plainShader.setBlendMode(tiledImage.index === 0 ?
                        "source-over" : tiledImage.compositeOperation || this.viewer.compositeOperation);
                    //tile level opacity not supported with single pass rendering
                    /* opacity is an IControl instantion */
                    plainShader.opacity.set(tiledImage.opacity);

                    const specificationObject = tiledImage.source.shader;
                    /* this.renderer.getCompiled ti vytiahne z webglprogramu z jeho _osdOptions co je v "debug" parametri si myslim */
                    // if (tiledImage.debugMode !== this.renderer.getCompiled("debug", specificationObject._programIndexTarget)) {
                    //     this.renderer.buildOptions.debug = tiledImage.debugMode;
                    //     //todo per image-level debug info :/
                    //     this.renderer.buildProgram(specificationObject._programIndexTarget, null, true, this.renderer.buildOptions);
                    // } po vykomentovani tohto tu som vyriesil error s tym cervenym stvorcom ktory sa tam daval naviac pri zapnuti debugu... inak netusim co to robi :((
                    this.renderer.useProgram(specificationObject._programIndexTarget);
                    // gl.clear(gl.STENCIL_BUFFER_BIT); neviem naco to tu je, skusim som odkomentovat a nic sa nestalo...


                    /* to iste az na pixelSize ktory je tu navyse */
                    let overallMatrix = viewMatrix;
                    let imageRotation = tiledImage.getRotation(true);
                    // if needed, handle the tiledImage being rotated
                    if( imageRotation % 360 !== 0) {
                        let imageRotationMatrix = $.Mat3.makeRotation(-imageRotation * Math.PI / 180);
                        let imageCenter = tiledImage.getBoundsNoRotate(true).getCenter();
                        let t1 = $.Mat3.makeTranslation(imageCenter.x, imageCenter.y);
                        let t2 = $.Mat3.makeTranslation(-imageCenter.x, -imageCenter.y);

                        // update the view matrix to account for this image's rotation
                        let localMatrix = t1.multiply(imageRotationMatrix).multiply(t2);
                        overallMatrix = viewMatrix.multiply(localMatrix);
                    }
                    let pixelSize = this.tiledImageViewportToImageZoom(tiledImage, viewport.zoom);

                    //batch rendering (artifacts)
                    //let batchSize = 0;

                    // iterate over tiles and add data for each one to the buffers
                    for (let tileIndex = 0; tileIndex < tilesToDraw.length; ++tileIndex) {
                        const tile = tilesToDraw[tileIndex].tile;

                        const tileContext = tile.getCanvasContext();
                        let tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        if (tileInfo === null) {
                            // tile was not processed in the tile-ready event (this can happen
                            // if this drawer was created after the tile was downloaded)
                            this._tileReadyHandler({tile: tile, tiledImage: tiledImage});
                            // retry getting textureInfo
                            tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        }
                        if (tileInfo === null) {
                            throw Error("webgldrawerModular::drawSinglePass: tile has no context!");
                        }

                        const matrix = this._getTileMatrix(tile, tiledImage, overallMatrix);

                        plainShader.opacity.set(tile.opacity * tiledImage.opacity);
                        //console.log('opacita pre plainshader =', tile.opacity * tiledImage.opacity);


                        /* DRAW */
                        this.renderer.processData(tileInfo.texture, {
                            transform: matrix,
                            zoom: viewport.zoom, //asi cislo
                            pixelSize: pixelSize, //asi cislo
                            textureCoords: tileInfo.position,
                        });
                        //batch rendering (artifacts)
                        // this._transformMatrices.set(matrix, batchSize * 9);
                        // this._tileTexturePositions.set(tileData.position, batchSize * 8);
                        // this._batchTextures[batchSize] = tileData.texture;
                        // batchSize++;
                        // if (batchSize === this.maxTextureUnits) {
                        //     console.log("tiles inside", this._tileTexturePositions);
                        //     this.renderer.processData(this._batchTextures, {
                        //         transform: this._transformMatrices,
                        //         zoom: viewport.zoom,
                        //         pixelSize: pixelSize,
                        //         textureCoords: this._tileTexturePositions,
                        //         instanceCount: batchSize
                        //     });
                        //     batchSize = 0;
                        // }
                    }

                    //batch rendering (artifacts)
                    // if (batchSize > 0) {
                    //     console.log("tiles outside", this._tileTexturePositions);
                    //
                    //     //todo possibly zero out unused, or limit drawing size
                    //     this.renderer.processData(this._batchTextures, {
                    //         transform: this._transformMatrices,
                    //         zoom: viewport.zoom,
                    //         pixelSize: pixelSize,
                    //         textureCoords: this._tileTexturePositions,
                    //         instanceCount: batchSize
                    //     });
                    // }

                    /* pridane z webgldrawer */
                    let useContext2dPipeline = (tiledImage.compositeOperation ||
                        this.viewer.compositeOperation ||
                        tiledImage._clip ||
                        tiledImage._croppingPolygons ||
                        tiledImage.debugMode
                    );
                    if (useContext2dPipeline) {
                        // draw from the rendering canvas onto the output canvas, clipping/cropping if needed
                        this._applyContext2dPipeline(tiledImage, tilesToDraw, tiledImageIndex);
                    } else {
                        this._outputContext.drawImage(this._renderingCanvas, 0, 0);
                    }
                    // clear the rendering canvas
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    this._renderingCanvasHasImageData = false;


                    // Fire tiled-image-drawn event.
                    // TODO: the image data may not be on the output canvas yet!!
                    if( this.viewer ){
                        /**
                         * Raised when a tiled image is drawn to the canvas. Only valid
                         * for webgl drawer.
                         *
                         * @event tiled-image-drawn
                         * @memberof OpenSeadragon.Viewer
                         * @type {object}
                         * @property {OpenSeadragon.Viewer} eventSource - A reference to the Viewer which raised the event.
                         * @property {OpenSeadragon.TiledImage} tiledImage - Which TiledImage is being drawn.
                         * @property {Array} tiles - An array of Tile objects that were drawn.
                         * @property {?Object} userData - Arbitrary subscriber-defined object.
                         */
                        this.viewer.raiseEvent( 'tiled-image-drawn', {
                            tiledImage: tiledImage,
                            tiles: tilesToDraw.map(info => info.tile),
                        });
                    }
                } //end of tiledImage.isTainted condition
            }); //end of for tiledImage of tiledImages
        }

        /**
         * Iba pre draw funkciu
         * @param {[TiledImage]} tiledImages Array of tiledImage objects to draw
         * @param {Object} viewport has bounds, center, rotation, zoom
         * @param {OpenSeadragon.Mat3} viewMatrix to apply
         */
        _drawTwoPassNew(tiledImages, viewport, viewMatrix) {
            // console.log('TWO PASS r3nd3r1ng being used');
            const gl = this._gl;
            const shaderSpecification = 0;
            gl.clear(gl.COLOR_BUFFER_BIT);

            tiledImages.forEach((tiledImage, tiledImageIndex) => {
                if (tiledImage.isTainted()) {
                    throw new Error("TiledImage.isTainted during two pass! -> not implemented!");
                } else {
                    let tilesToDraw = tiledImage.getTilesToDraw();

                    // pridane z merge-u
                    if ( tiledImage.placeholderFillStyle && tiledImage._hasOpaqueTile === false ) {
                        throw new Error("Drawtwopass: placeholderfillstyle not implemented!");
                    }
                    // nothing to draw or opacity is zero
                    if (tilesToDraw.length === 0 || tiledImage.getOpacity() === 0) {
                        return; // return or continue?
                    }

                    const plainShader = this.renderer.getSpecification(shaderSpecification).shaders.renderShader._renderContext;
                    plainShader.setBlendMode(tiledImage.index === 0 ? "source-over" : tiledImage.compositeOperation || this.viewer.compositeOperation);

                    //console.log('tiledImage.source:', tiledImage.source.shader);
                    const specificationObject = tiledImage.source.shader;
                    // change the program to first pass, just render tiles as they are
                    this.renderer.useProgram(specificationObject._programIndexTarget);
                    this.renderer.switchToRenderingPass(1);

                    // render to offScreenTexture
                    this._bindFrameBufferToOffScreenTexture(tiledImageIndex);


                    // MATRIX
                    let overallMatrix = viewMatrix;
                    let imageRotation = tiledImage.getRotation(true);
                    // if needed, handle the tiledImage being rotated
                    if( imageRotation % 360 !== 0) {
                        let imageRotationMatrix = $.Mat3.makeRotation(-imageRotation * Math.PI / 180);
                        let imageCenter = tiledImage.getBoundsNoRotate(true).getCenter();
                        let t1 = $.Mat3.makeTranslation(imageCenter.x, imageCenter.y);
                        let t2 = $.Mat3.makeTranslation(-imageCenter.x, -imageCenter.y);

                        // update the view matrix to account for this image's rotation
                        let localMatrix = t1.multiply(imageRotationMatrix).multiply(t2);
                        overallMatrix = viewMatrix.multiply(localMatrix);
                    }
                    let pixelSize = this.tiledImageViewportToImageZoom(tiledImage, viewport.zoom);

                    // ITERATE over TILES and render data into offScreenTexture
                    for (let tileIndex = 0; tileIndex < tilesToDraw.length; ++tileIndex) {
                        //console.log('Kreslim tile cislo', tileIndex);
                        const tile = tilesToDraw[tileIndex].tile;

                        const tileContext = tile.getCanvasContext();
                        let tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        if (tileInfo === null) {
                            // tile was not processed in the tile-ready event (this can happen
                            // if this drawer was created after the tile was downloaded)
                            this._tileReadyHandler({tile: tile, tiledImage: tiledImage});
                            // retry getting textureInfo
                            tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        }
                        if (tileInfo === null) {
                            throw Error("webgldrawerModular::drawTwoPass: tile has no context!");
                        }

                        // get transform matrix that puts tile on correct position
                        const matrix = this._getTileMatrix(tile, tiledImage, overallMatrix);
                        // tiledImage has its own opacity and tile can also have its own opacity
                        plainShader.opacity.set(tile.opacity * tiledImage.opacity);

                        /* DRAW */
                        console.log('Drawujem tile-u');
                        this.renderer.processData(tileInfo.texture, {
                            transform: matrix,
                            zoom: viewport.zoom, //asi cislo
                            pixelSize: pixelSize, //asi cislo
                            textureCoords: tileInfo.position,
                        });

                        // debuggin after first tile drawn (zaujimave, akoby jemnejsie pozadie + uplne bez mriezky)
                        if (tileIndex === 0) {
                            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                            this.renderer.switchToRenderingPass(2);

                            console.log('Drawujem second pass (tiledImage)');

                            this.renderer.processData(this._renderOffScreenTextures[tiledImageIndex], {
                                transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                                zoom: 1,
                                pixelSize: 1,
                                textureCoords: [0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0],
                            });


                            this._outputContext.drawImage(this._renderingCanvas, 0, 0);
                            throw new Error("dodrawnute");
                        }
                    } // end of TILES iteration



                    //---------------------------------------------------------------
                    // render from texture to canvas
                    let temp = 4;
                    if (1 + 2 === temp) {
                        console.warn('Preskakujem second pass!');
                    } else {
                        // gl.useProgram(this.programSecondPass);
                        this.renderer.switchToRenderingPass(2);
                        gl.bindFramebuffer(gl.FRAMEBUFFER, null);


                        console.log('Drawujem second pass (tiledImage)');

                        this.renderer.processData(this._renderOffScreenTextures[tiledImageIndex], {
                            transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                            zoom: 1,
                            pixelSize: 1,
                            textureCoords: [0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0],
                        });

                        // treba toto?
                        // const textureLocation = gl.getUniformLocation(this.programSecondPass, "u_texture");
                        // gl.uniform1i(textureLocation, 0);
                        // gl.activeTexture(gl.TEXTURE0); // do tadialto toto?
                        // const texture = this._renderOffScreenTextures[tiledImageIndex];
                        // gl.bindTexture(gl.TEXTURE_2D, texture);


                        // const positionBuffer = gl.createBuffer();
                        // gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                        // this.__setRectangleStrip(gl, 0, 0, 1, 1);
                        // const positionLocation = gl.getAttribLocation(this.programSecondPass, "a_positionn");
                        // if (positionLocation === -1) {
                        //     throw new Error("Nenasiel som v akutalnom programe a_position!");
                        // }
                        // gl.enableVertexAttribArray(positionLocation);
                        // gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);


                        // const texcoordBuffer = gl.createBuffer();
                        // gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
                        // this.__setRectangleStrip(gl, 0, 0, 1, 1);
                        // const texcoordLocation = gl.getAttribLocation(this.programSecondPass, "a_texCoords");
                        // if (texcoordLocation === -1) {
                        //     throw new Error("Nenasiel som v akutalnom programe a_texCoords!");
                        // }
                        // gl.enableVertexAttribArray(texcoordLocation);
                        // gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);


                        // gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                        // console.log('po second passe');
                    }


                    // Apply context2DPipeline or tick the flag that data are in rendering canvas and need to be copied to output canvas
                    let useContext2dPipeline = (tiledImage.compositeOperation ||
                        this.viewer.compositeOperation ||
                        tiledImage._clip ||
                        tiledImage._croppingPolygons ||
                        tiledImage.debugMode
                    );
                    if (useContext2dPipeline) {
                        // draw from the rendering canvas onto the output canvas, clipping/cropping if needed
                        this._applyContext2dPipeline(tiledImage, tilesToDraw, tiledImageIndex);
                    } else {
                        this._outputContext.drawImage(this._renderingCanvas, 0, 0);
                    }
                    // clear the rendering canvas
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    this._renderingCanvasHasImageData = false;

                }

            }); //end of for tiledImage of tiledImages
        } // end of new two pass


        _drawTwoPassEasy(tiledImages, viewport, viewMatrix) {
            // pozadie svetlo zelene po first passe, po renderovani z textury pozadie silno modre (initial data v texture)
            const gl = this._gl;
            gl.clearColor(0, 1, 0, 0.5);
            gl.clear(gl.COLOR_BUFFER_BIT);

            tiledImages.forEach((tiledImage, tiledImageIndex) => {
                if (tiledImage.isTainted()) {
                    throw new Error("TiledImage.isTainted during two pass! -> not implemented!");
                } else {
                    let tilesToDraw = tiledImage.getTilesToDraw();

                    // pridane z merge-u
                    if ( tiledImage.placeholderFillStyle && tiledImage._hasOpaqueTile === false ) {
                        throw new Error("Drawtwopass: placeholderfillstyle not implemented!");
                    }
                    // nothing to draw or opacity is zero
                    if (tilesToDraw.length === 0 || tiledImage.getOpacity() === 0) {
                        return; // return or continue?
                    }


                    // MATRIX
                    let overallMatrix = viewMatrix;
                    let imageRotation = tiledImage.getRotation(true);
                    // if needed, handle the tiledImage being rotated
                    if( imageRotation % 360 !== 0) {
                        let imageRotationMatrix = $.Mat3.makeRotation(-imageRotation * Math.PI / 180);
                        let imageCenter = tiledImage.getBoundsNoRotate(true).getCenter();
                        let t1 = $.Mat3.makeTranslation(imageCenter.x, imageCenter.y);
                        let t2 = $.Mat3.makeTranslation(-imageCenter.x, -imageCenter.y);

                        // update the view matrix to account for this image's rotation
                        let localMatrix = t1.multiply(imageRotationMatrix).multiply(t2);
                        overallMatrix = viewMatrix.multiply(localMatrix);
                    }
                    // let pixelSize = this.tiledImageViewportToImageZoom(tiledImage, viewport.zoom);


                    // ITERATE over TILES
                    for (let tileIndex = 0; tileIndex < tilesToDraw.length; ++tileIndex) {
                        //console.log('Kreslim tile cislo', tileIndex);
                        const tile = tilesToDraw[tileIndex].tile;

                        const tileContext = tile.getCanvasContext();
                        let tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        if (tileInfo === null) {
                            // tile was not processed in the tile-ready event (this can happen
                            // if this drawer was created after the tile was downloaded)
                            this._tileReadyHandler({tile: tile, tiledImage: tiledImage});
                            // retry getting textureInfo
                            tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        }
                        if (tileInfo === null) {
                            throw Error("webgldrawerModular::drawTwoPass: tile has no context!");
                        }

                        const matrix = this._getTileMatrix(tile, tiledImage, overallMatrix);


                        // SUPPLY data to webgl
                        // SWITCH to first pass program, just render tiles as they are
                        gl.useProgram(this.programFirstPass);
                        // ENABLE rendering to a texture
                        //this._bindFrameBufferToOffScreenTexture(tiledImageIndex);

                        // fill the position buffer with 4 (x,y) points representing triangle strip over viewport
                        const positionBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                        // NEFUNGOVAL set rectangle strip dobre, manualne skopirovane nahravanie dat z modularnej implementacie podla quad z vertex shaderu
                        //this.__setRectangleStrip(gl, 0, 0, 1, 1);
                        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                            0.0, 1.0,
                            0.0, 0.0,
                            1.0, 1.0,
                            1.0, 0.0,
                        ]), gl.STATIC_DRAW);
                        const positionLocation = gl.getAttribLocation(this.programFirstPass, "a_position");
                        gl.enableVertexAttribArray(positionLocation);
                        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

                        // fill the texture coordinates
                        const texCoordBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
                        //console.log('tileinfo poisiton:', tileInfo.position);
                        gl.bufferData(gl.ARRAY_BUFFER, tileInfo.position, gl.STATIC_DRAW);
                        const texCoordLocation = gl.getAttribLocation(this.programFirstPass, "a_texCoord");
                        gl.enableVertexAttribArray(texCoordLocation);
                        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

                        // fill the transform matrix
                        const matrixLocation = gl.getUniformLocation(this.programFirstPass, "u_transform_matrix");
                        gl.uniformMatrix3fv(matrixLocation, false, matrix);
                        //console.log('Transform matrix = ', matrix);

                        // fill the texture
                        const textureLocation = gl.getUniformLocation(this.programFirstPass, "u_texture");
                        gl.uniform1i(textureLocation, 0);
                        gl.activeTexture(gl.TEXTURE0);
                        gl.bindTexture(gl.TEXTURE_2D, tileInfo.texture);

                        // draw
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    } // end of TILES iteration

                    //---------------------------------------------------------------
                    // Render from texture to canvas
                    let temp = 4;
                    if (1 + 2 === temp) {
                        console.warn('Preskakujem second pass!');
                    } else {
                        console.log('Dokreslene do textury, mal by som tam mat cely tiledImage, idem na secondPass!');
                        gl.useProgram(this.programSecondPass);
                        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                        // treba toto?
                        const textureLocation = gl.getUniformLocation(this.programSecondPass, "u_texture");
                        gl.uniform1i(textureLocation, 0);
                        gl.activeTexture(gl.TEXTURE0); // do tadialto toto?
                        const texture = this._renderOffScreenTextures[tiledImageIndex];
                        gl.bindTexture(gl.TEXTURE_2D, texture);


                        // position vertices over whole viewport
                        const positionBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
                        this.__setRectangleStrip(gl, 0, 0, 1, 1);
                        const positionLocation = gl.getAttribLocation(this.programSecondPass, "a_positionn");
                        if (positionLocation === -1) {
                            throw new Error("Nenasiel som v akutalnom programe a_position!");
                        }
                        gl.enableVertexAttribArray(positionLocation);
                        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

                        // texture coordinates over whole texture
                        const texcoordBuffer = gl.createBuffer();
                        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
                        this.__setRectangleStrip(gl, 0, 0, 1, 1);
                        const texcoordLocation = gl.getAttribLocation(this.programSecondPass, "a_texCoords");
                        if (texcoordLocation === -1) {
                            throw new Error("Nenasiel som v akutalnom programe a_texCoords!");
                        }
                        gl.enableVertexAttribArray(texcoordLocation);
                        gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);


                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                        console.log('po second passe');
                    }

                    //---------------------------------------------------------------
                    // Apply context2DPipeline or tick the flag that data are in rendering canvas and need to be copied to output canvas
                    let useContext2dPipeline = (tiledImage.compositeOperation ||
                        this.viewer.compositeOperation ||
                        tiledImage._clip ||
                        tiledImage._croppingPolygons ||
                        tiledImage.debugMode
                    );
                    if (useContext2dPipeline) {
                        // draw from the rendering canvas onto the output canvas, clipping/cropping if needed
                        this._applyContext2dPipeline(tiledImage, tilesToDraw, tiledImageIndex);
                    } else {
                        this._outputContext.drawImage(this._renderingCanvas, 0, 0);
                    }
                    // clear the rendering canvas
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    this._renderingCanvasHasImageData = false;

                } // end of tiledImage is not tainted condition
            }); //end of for tiledImage of tiledImages
        } // end of new two pass easy

        _drawTwoPassEZ(tiledImages, viewport, viewMatrix) {
            // pozadie svetlo zelene po first passe, po renderovani z textury pozadie silno modre (initial data v texture)
            const gl = this._gl;
            const data = this.programEZData;
            gl.useProgram(this.programEZ);
            //gl.clearColor(0, 1, 0, 0.5);
            gl.clear(gl.COLOR_BUFFER_BIT);

            tiledImages.forEach((tiledImage, tiledImageIndex) => {
                if (tiledImage.isTainted()) {
                    throw new Error("TiledImage.isTainted during two pass! -> not implemented!");
                } else {
                    let tilesToDraw = tiledImage.getTilesToDraw();

                    // pridane z merge-u
                    if ( tiledImage.placeholderFillStyle && tiledImage._hasOpaqueTile === false ) {
                        throw new Error("Drawtwopass: placeholderfillstyle not implemented!");
                    }
                    // nothing to draw or opacity is zero
                    if (tilesToDraw.length === 0 || tiledImage.getOpacity() === 0) {
                        return; // return or continue?
                    }


                    // MATRIX
                    let overallMatrix = viewMatrix;
                    let imageRotation = tiledImage.getRotation(true);
                    // if needed, handle the tiledImage being rotated
                    if( imageRotation % 360 !== 0) {
                        let imageRotationMatrix = $.Mat3.makeRotation(-imageRotation * Math.PI / 180);
                        let imageCenter = tiledImage.getBoundsNoRotate(true).getCenter();
                        let t1 = $.Mat3.makeTranslation(imageCenter.x, imageCenter.y);
                        let t2 = $.Mat3.makeTranslation(-imageCenter.x, -imageCenter.y);

                        // update the view matrix to account for this image's rotation
                        let localMatrix = t1.multiply(imageRotationMatrix).multiply(t2);
                        overallMatrix = viewMatrix.multiply(localMatrix);
                    }
                    // let pixelSize = this.tiledImageViewportToImageZoom(tiledImage, viewport.zoom);


                    // ITERATE over TILES
                    for (let tileIndex = 0; tileIndex < tilesToDraw.length; ++tileIndex) {
                        //console.log('Kreslim tile cislo', tileIndex);
                        const tile = tilesToDraw[tileIndex].tile;

                        const tileContext = tile.getCanvasContext();
                        let tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        if (tileInfo === null) {
                            // tile was not processed in the tile-ready event (this can happen
                            // if this drawer was created after the tile was downloaded)
                            this._tileReadyHandler({tile: tile, tiledImage: tiledImage});
                            // retry getting textureInfo
                            tileInfo = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                        }
                        if (tileInfo === null) {
                            throw Error("webgldrawerModular::drawTwoPass: tile has no context!");
                        }

                        const matrix = this._getTileMatrix(tile, tiledImage, overallMatrix);


                        // SUPPLY data to webgl
                        // render to texture
                        this._bindFrameBufferToOffScreenTexture(tiledImageIndex);

                        // position
                        gl.bindBuffer(gl.ARRAY_BUFFER, data.positionBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                            0.0, 1.0,
                            0.0, 0.0,
                            1.0, 1.0,
                            1.0, 0.0,
                        ]), gl.STATIC_DRAW);

                        // texture coordinates
                        gl.bindBuffer(gl.ARRAY_BUFFER, data.texCoordBuffer);
                        gl.bufferData(gl.ARRAY_BUFFER, tileInfo.position, gl.STATIC_DRAW);

                        // transform matrix
                        gl.uniformMatrix3fv(data.matrixLocation, false, matrix);

                        // pass flag
                        gl.uniform1i(data.passLocation, 1);

                        // texture
                        gl.bindTexture(gl.TEXTURE_2D, tileInfo.texture);

                        // draw
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                    }

                    //---------------------------------------------------------------
                    // Render from texture to canvas
                    let temp = 4;
                    if (1 + 2 === temp) {
                        console.warn('Preskakujem second pass!');
                    } else {
                        // console.log('Dokreslene do textury, mal by som tam mat cely tiledImage, idem na secondPass!');
                        // render to canvas
                        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                        // position
                        gl.bindBuffer(gl.ARRAY_BUFFER, data.positionBuffer);
                        this.__setRectangleStrip(gl, 0, 0, 1, 1);

                        // texture coordinates
                        gl.bindBuffer(gl.ARRAY_BUFFER, data.texCoordBuffer);
                        this.__setRectangleStrip(gl, 0, 0, 1, 1);

                        // transform matrix not used during second pass => whole texture to whole viewport

                        // pass flag
                        gl.uniform1i(data.passLocation, 2);

                        // texture
                        const texture = this._renderOffScreenTextures[tiledImageIndex];
                        gl.bindTexture(gl.TEXTURE_2D, texture);

                        // draw
                        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                        console.log('po second passe z EZ programu!');
                    }

                    //---------------------------------------------------------------
                    // Apply context2DPipeline or tick the flag that data are in rendering canvas and need to be copied to output canvas
                    let useContext2dPipeline = (tiledImage.compositeOperation ||
                        this.viewer.compositeOperation ||
                        tiledImage._clip ||
                        tiledImage._croppingPolygons ||
                        tiledImage.debugMode
                    );
                    if (useContext2dPipeline) {
                        // draw from the rendering canvas onto the output canvas, clipping/cropping if needed
                        this._applyContext2dPipeline(tiledImage, tilesToDraw, tiledImageIndex);
                    } else {
                        this._outputContext.drawImage(this._renderingCanvas, 0, 0);
                    }
                    // clear the rendering canvas
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    this._renderingCanvasHasImageData = false;
                }
            });
        }

        __setRectangle(gl, x, y, width, height) {
            // Fills the ARRAY_BUFFER with two triangles representing a rectangle
            var x1 = x;
            var x2 = x + width;
            var y1 = y;
            var y2 = y + height;
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                x1, y1,
                x2, y1,
                x1, y2,
                x1, y2,
                x2, y1,
                x2, y2,
            ]), gl.STATIC_DRAW);
        }

        __setRectangleStrip(gl, x, y, width, height) {
            // Fills the ARRAY_BUFFER with triangle strip representing a rectangle
            var x1 = x;
            var x2 = x + width;
            var y1 = y;
            var y2 = y + height;
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                x1, y1,
                x2, y1,
                x1, y2,
                x2, y2,
            ]), gl.STATIC_DRAW);
        }

        __createShader(gl, type, source) {
            const shader = gl.createShader(type);
            // console.log(source);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
              console.error("Shader compilation error:", gl.getShaderInfoLog(shader));
              return null;
            }
            return shader;
        }

        __createProgram(gl, vertexShader, fragmentShader) {
            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
              console.error("Program linking error:", gl.getProgramInfoLog(program));
              return null;
            }
            return program;
        }

        /* iba pre draw funkciu, ani nepouzite zatial lebo cez if nejdem tymto */
        _drawTwoPass(tiledImages, viewport, viewMatrix) {
            console.log('Idem drawovat two pass');
            const gl = this._gl;
            gl.clear(gl.COLOR_BUFFER_BIT);

            let drawnItems = 0;
            for (const tiledImage of tiledImages) {
                let tilesToDraw = tiledImage.getTilesToDraw();

                if (tilesToDraw.length === 0) {
                    continue;
                }

                //second pass first: check whether next render won't overflow batch size
                //todo better access to the rendering context
                const shader = this.renderer.getSpecification(0).shaders.renderShader._renderContext;
                shader.setBlendMode(tiledImage.index === 0 ?
                    "source-over" : tiledImage.compositeOperation || this.viewer.compositeOperation);
                // const willDraw = drawnItems + shader.dataReferences.length;
                // if (willDraw > this.maxTextureUnits) {
                //     //merge to the output screen
                //     this._bindFrameBufferToOffScreenTexture(-1);
                //
                //     //todo
                //
                //     drawnItems = 0;
                // }

                this.renderer.useProgram(0); //todo use program based on texture used, e.g. drawing multi output
                this._bindFrameBufferToOffScreenTexture(drawnItems);

                let overallMatrix = viewMatrix;
                let imageRotation = tiledImage.getRotation(true);
                // if needed, handle the tiledImage being rotated
                if( imageRotation % 360 !== 0){
                    let imageRotationMatrix = $.Mat3.makeRotation(-imageRotation * Math.PI / 180);
                    let imageCenter = tiledImage.getBoundsNoRotate(true).getCenter();
                    let t1 = $.Mat3.makeTranslation(imageCenter.x, imageCenter.y);
                    let t2 = $.Mat3.makeTranslation(-imageCenter.x, -imageCenter.y);

                    // update the view matrix to account for this image's rotation
                    let localMatrix = t1.multiply(imageRotationMatrix).multiply(t2);
                    overallMatrix = viewMatrix.multiply(localMatrix);
                }

                // iterate over tiles and add data for each one to the buffers
                for (let tileIndex = tilesToDraw.length - 1; tileIndex >= 0; tileIndex--){
                    const tile = tilesToDraw[tileIndex].tile;
                    const tileContext = tile.getCanvasContext();
                    const tileData = tileContext ? this._TextureMap.get(tileContext.canvas) : null;
                    if (tileData === null) {
                        throw Error("webgldrawer::drawXPass: tile has no context!");
                    }
                    const matrix = this._getTileMatrix(tile, tiledImage, overallMatrix);
                    shader.opacity.set(tile.opacity * tiledImage.opacity);

                    //todo pixelSize value (not yet memoized)
                    this.renderer.processData(tileData.texture, {
                        transform: matrix,
                        zoom: viewport.zoom,
                        pixelSize: 0,
                        textureCoords: tileData.position
                    });
                }

                ++drawnItems;

                // Fire tiled-image-drawn event.
                // TODO: the image data may not be on the output canvas yet!!
                if( this.viewer ){
                    /**
                     * Raised when a tiled image is drawn to the canvas. Only valid
                     * for webgl drawer.
                     *
                     * @event tiled-image-drawn
                     * @memberof OpenSeadragon.Viewer
                     * @type {object}
                     * @property {OpenSeadragon.Viewer} eventSource - A reference to the Viewer which raised the event.
                     * @property {OpenSeadragon.TiledImage} tiledImage - Which TiledImage is being drawn.
                     * @property {Array} tiles - An array of Tile objects that were drawn.
                     * @property {?Object} userData - Arbitrary subscriber-defined object.
                     */
                    this.viewer.raiseEvent( 'tiled-image-drawn', {
                        tiledImage: tiledImage,
                        tiles: tilesToDraw.map(info => info.tile),
                    });
                }
            }
        }

        /* podobne ako webgldrawer _getTileData ale toto sa mi lubi viac, je krajsia funckia, sustredi sa iba na maticu
        tie ostatne veci ktore sa nastavuju v _getTileData su podla mna prebytocne do tejto funkcie dat... */
        _getTileMatrix(tile, tiledImage, viewMatrix){
            // compute offsets that account for tile overlap; needed for calculating the transform matrix appropriately
            // x, y, w, h in viewport coords

            let overlapFraction = this._calculateOverlapFraction(tile, tiledImage);
            let xOffset = tile.positionedBounds.width * overlapFraction.x;
            let yOffset = tile.positionedBounds.height * overlapFraction.y;

            let x = tile.positionedBounds.x + (tile.x === 0 ? 0 : xOffset);
            let y = tile.positionedBounds.y + (tile.y === 0 ? 0 : yOffset);
            let right = tile.positionedBounds.x + tile.positionedBounds.width - (tile.isRightMost ? 0 : xOffset);
            let bottom = tile.positionedBounds.y + tile.positionedBounds.height - (tile.isBottomMost ? 0 : yOffset);
            let w = right - x;
            let h = bottom - y;

            let matrix = new $.Mat3([
                w, 0, 0,
                0, h, 0,
                x, y, 1,
            ]);

            if (tile.flipped) {
                const flipLeftAroundTileOrigin = $.Mat3.makeScaling(-1, 1);
                const moveRightAfterScaling = $.Mat3.makeTranslation(-1, 0);
                matrix = matrix.multiply(flipLeftAroundTileOrigin).multiply(moveRightAfterScaling);
            }

            let overallMatrix = viewMatrix.multiply(matrix);
            return overallMatrix.values;
        }

        /* Nove z merge-u */
        _drawPlaceholder(tiledImage){
            console.log('Volal sa _drawPlaceholder');
            const bounds = tiledImage.getBounds(true);
            const rect = this.viewportToDrawerRectangle(tiledImage.getBounds(true));
            const context = this._outputContext;

            let fillStyle;
            if ( typeof tiledImage.placeholderFillStyle === "function" ) {
                fillStyle = tiledImage.placeholderFillStyle(tiledImage, context);
            }
            else {
                fillStyle = tiledImage.placeholderFillStyle;
            }

            this._offsetForRotation({degrees: this.viewer.viewport.getRotation(true)});
            context.fillStyle = fillStyle;
            context.translate(rect.x, rect.y);
            context.rotate(Math.PI / 180 * bounds.degrees);
            context.translate(-rect.x, -rect.y);
            context.fillRect(rect.x, rect.y, rect.width, rect.height);
            this._restoreRotationChanges();
        }


    };
}( OpenSeadragon ));
