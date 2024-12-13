(function($) {


    /**
     * Wrapping the funcionality of WebGL to be suitable for tile processing and rendering.
     * Written by Aiosa
     * @class OpenSeadragon.WebGLModule
     * @memberOf OpenSeadragon
     */
    $.WebGLModule = class extends $.EventSource {
        /**
         * @typedef {{
         *  name?: string,
         *  lossless?: boolean,
         *  shaders: Object.<string, OpenSeadragon.WebGLModule.ShaderLayerConfig>
         * }} OpenSeadragon.WebGLModule.RenderingConfig
         *
         * //use_channel[X] name
         * @template {Object<string,any>} TUseChannel
         * //use_[fitler_name]
         * @template {Object<string,number>} TUseFilter
         * @template {Object<string,(string|any)>} TIControlConfig
         * @typedef OpenSeadragon.WebGLModule.ShaderLayerParams
         * @type {{TUseChannel,TUseFilter,TIControlConfig}}
         *
         * @typedef {{
         *   name?: string,
         *   type: string,
         *   visible?: boolean,
         *   dataReferences: number[],
         *   params?: OpenSeadragon.WebGLModule.ShaderLayerParams,
         *  }} OpenSeadragon.WebGLModule.ShaderLayerConfig
         *
         *
         * @typedef OpenSeadragon.WebGLModule.UIControlsRenderer
         * @type function
         * @param {string} title
         * @param {string} html
         * @param {string} dataId
         * @param {boolean} isVisible
         * @param {Object} layer
         * @param {boolean} wasErrorWhenLoading
         * @param {OpenSeadragon.WebGLModule.ShaderLayer} shaderLayer
         */


        /**
         * @constructor
         * @param {object} incomingOptions
         *
         * @param {object} incomingOptions.canvasOptions
         * @param {boolean} incomingOptions.canvasOptions.alpha
         * @param {boolean} incomingOptions.canvasOptions.premultipliedAlpha
         * @param {boolean} incomingOptions.canvasOptions.stencil
         *
         * @param {boolean} incomingOptions.debug debug mode default false
         *
         * @param {string} incomingOptions.htmlControlsId where to render html controls
         * @param {OpenSeadragon.WebGLModule.UIControlsRenderer} incomingOptions.htmlShaderPartHeader function that generates particular layer HTML

         * @param {function} incomingOptions.onError (error) => {}, function called when error occurs -> continue rendering
         * @param {function} incomingOptions.onFatalError (error) => {}, function called when fatal error occurs -> stops the rendering
         * @param {function} incomingOptions.ready () => {}, function called when ready
         * @param {function} incomingOptions.resetCallback () => {}, function called when user input changed, trigger rerendering of the viewport
         * @param {function} incomingOptions.refetchCallback () => {}, function called when underlying data changed

         * @param {string} incomingOptions.uniqueId

         * @param {function} incomingOptions.visualisationChanged (oldVisualisation, newVisualisation) => {}
         * @param {function} incomingOptions.visualisationInUse (visualisation) => {}

         * @param {object} incomingOptions.webGLOptions
         * @param {string} incomingOptions.webGLPreferredVersion prefered WebGL version, "1.0" or "2.0"
         */
        constructor(incomingOptions) {
            super();
            console.log('Robim renderer, htmlControlsId =', incomingOptions.htmlControlsId);

            if (!this.constructor.idPattern.test(incomingOptions.uniqueId)) {
                throw "$.WebGLModule::constructor: invalid ID! Id can contain only letters, numbers and underscore. ID: " + incomingOptions.uniqueId;
            }

            this.uniqueId = incomingOptions.uniqueId;

            this.webGLPreferredVersion = incomingOptions.webGLPreferredVersion;
            this.webGLOptions = incomingOptions.webGLOptions;

            this.canvasContextOptions = incomingOptions.canvasOptions;

            this.htmlControlsId = incomingOptions.htmlControlsId;
            if (this.supportsHtmlControls()) {
                this.htmlControlsElement = document.getElementById(this.htmlControlsId);
                if (!this.htmlControlsElement) {
                    console.warn('$.WebGLModule::constructor: drawer should support HTML controls, but renderer could not find DOM element with id =', this.htmlControlsId);
                    this.htmlControlsId = null;
                }
            }
            this.htmlShaderPartHeader = incomingOptions.htmlShaderPartHeader;

            this.ready = incomingOptions.ready;
            this.resetCallback = incomingOptions.resetCallback;

            this.refetchCallback = incomingOptions.refetchCallback;

            this.debug = incomingOptions.debug;

            this.visualisationReady = (i, visualisation) => { }; // called once a visualisation is compiled and linked (might not happen) [spec + program + shaders ready I guess]
            this.running = false; // correctly running using some valid specification

            this._initialized = false; // init was called
            this._program = -1; // number, index of WebGLProgram currently being used
            this._programs = {}; // {number: WebGLProgram}, WebGLPrograms indexed with numbers
            this._programSpecifications = []; // [object], array of specification objects, index of specification corresponds to index of WebGLProgram created from that specification in _programs

            this.shadersCounter = {}; // {identity: <num of tiledImages using identity>, edge: <num of tiledImages using edges>}

            const canvas = document.createElement("canvas");
            const WebGLImplementation = this.constructor.determineContext(this.webGLPreferredVersion);
            const webGLRenderingContext = $.WebGLModule.WebGLImplementation.create(canvas, this.webGLPreferredVersion, this.canvasContextOptions);
            if (webGLRenderingContext) {
                this.gl = webGLRenderingContext;                                            // WebGLRenderingContext|WebGL2RenderingContext
                this.webglContext = new WebGLImplementation(this, webGLRenderingContext);   // $.WebGLModule.WebGLImplementation
                this.canvas = canvas;
            } else {
                throw new Error("$.WebGLModule::constructor: Could not create WebGLRenderingContext!");
            }
        }

        /**
         * Search through all $.WebGLModule properties and find one that extends WebGLImplementation and it's getVersion() function returns "version" input parameter.
         * @param {string} version webgl version, "1.0" or "2.0"
         * @returns {WebGLImplementation}
         */
        static determineContext(version) {
            // console.log("zistujem kontext, asi takym sposobom ze zas vsetko hladam hah ale z CLASSSSYYYYYYYYYY");
            const namespace = OpenSeadragon.WebGLModule;
            for (let property in namespace) {
                const context = namespace[ property ],
                    proto = context.prototype;
                if (proto && proto instanceof namespace.WebGLImplementation &&
                    $.isFunction( proto.getVersion ) && proto.getVersion.call( context ) === version) {
                        return context;
                }
            }

            throw new Error("$.WebGLModule::determineContext: Could not find WebGLImplementation with version " + version);
        }

        /**
         * Sets viewport dimensions.
         * @instance
         * @memberOf WebGLModule
         */
        setDimensions(x, y, width, height) {
            // NETUSIM Z KADE SA TU ZJAVIL V RENDERERI CANVAS -> treba zistit ach jo
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(x, y, width, height);
        }



        /**
         * Draw call.
         * @param {Object} renderInfo
         * @param {Float32Array} renderInfo.transform position transform matrix or flat matrix array (instance drawing)
         * @param {number} renderInfo.zoom value passed to the shaders as zoom_level
         * @param {number} renderInfo.pixelSize value passed to the shaders as pixel_size_in_fragments
         * @param {number} renderInfo.globalOpacity value passed to the shaders as global_alpha
         * @param {Float32Array} renderInfo.textureCoords 8 numbers representing triangle strip
         *
         * @param {ShaderLayer} shaderLayer instantion of shaderLayer to use

         * @param {object} source
         * @param {[WebGLTexture]} source.textures     // [TEXTURE_2D]
         * @param {WebGLTexture} source.texture2DArray // TEXTURE_2D_ARRAY
         * @param {number} source.index                // index of texture in textures array or index of layer in texture2DArray
         *
         * @instance
         * @memberOf WebGLModule
         */
        processData(renderInfo, shaderLayer, source) {
            if (this.webGLPreferredVersion === "2.0") {
                // console.log('V processe, renderInfo.textureCoords =', renderInfo.textureCoords);
                this.webglContext.useProgram(this._program, renderInfo, shaderLayer, source.texture2DArray, source.index);
            } else {
                this.webglContext.useProgram(this._program, renderInfo, shaderLayer, source.textures[source.index]);
                // this.webglContext.loadFirstPassProgram();
                // this.webglContext.drawFirstPassProgram(source.textures[source.index], renderInfo.textureCoords, renderInfo.transform);
            }
        }

        firstPassProcessData(textureCoords, transformMatrix, source) {
            if (this.webGLPreferredVersion === "2.0") {
                this.webglContext.useProgramForFirstPass(transformMatrix, textureCoords, source.texture2DArray, source.index);
            } else {
                this.webglContext.useProgramForFirstPass(transformMatrix, textureCoords, source.textures[source.index]);
            }
        }

        /**
         * Whether the webgl module renders UI
         * @return {boolean}
         * @instance
         * @memberOf WebGLModule
         */
        supportsHtmlControls() {
            return typeof this.htmlControlsId === "string" && this.htmlControlsId.length > 0;
        }

        createProgram() {
            const Shader = $.WebGLModule.ShaderMediator.getClass("firstPass");
            if (!Shader) {
                throw new Error("$.WebGLModule::createProgram: Could not create WebGL program!");
            }

            const shader = new Shader("first_pass_identity", {
                shaderObject: {},
                webglContext: this.webglContext,
                controls: {},
                interactive: false,
                cache: {},
                invalidate: () => {},
                rebuild: () => {}, // need to rebuild the whole shaderLayer
                refetch: () => {}  // need to reinitialize whole drawer? probably not needed
            });
            shader.__channels = {};
            shader.__channels[0] = "rgba";

            this._firstPassShader = shader;

            this.recreateProgram();
        }

        recreateProgram() {
            const program = this.webglContext.createProgram(this.shadersCounter);
            this.gl.useProgram(program);

            if (this.supportsHtmlControls()) {
                this.htmlControlsElement.innerHTML = program._osdOptions.html;
                // for (const shaderLayer of Object.values(this.shadersCounter)) {
                //     shaderLayer.registerControlsHandlers(this.resetCallback);
                // }
            }
            for (const shaderLayer of Object.values(this.shadersCounter)) {
                // shaderLayer.initControls(this.resetCallback);
                shaderLayer.init();
            }

            this._program = program;
            // firstly has to initialize the controls, then I can load everything
            this.webglContext.loadProgram(program, this.shadersCounter);

            if (!this.running) {
                //TODO: might not be the best place to call, timeout necessary to allow finish initialization of OSD before called
                setTimeout(() => this.ready());
            }
            this.running = true;

            console.info('$.WebGLModule::recreateProgram: PROGRAM CREATED!');
        }

        /**
         * Description:
         * @param {object} shaderObject object bind to concrete shaderLayer instantion
         * @param {string} shaderType eg.: identity, edge, negative,...
         * @param {string} shaderID "<tiledImageIndex>_<sourceIndex>"
         * @returns {ShaderLayer} instantion of newly created shaderLayer
         */
        addShader(shaderObject, shaderType, shaderID) {
            console.log('renderer:: addShader call!');
            // console.info('$.WebGLModule::addShader: Shaders available =', $.WebGLModule.ShaderMediator.availableTypes());

            // shaderType = "identity" for example
            const Shader = $.WebGLModule.ShaderMediator.getClass(shaderType);
            if (!Shader) {
                throw new Error(`$.WebGLModule::addShader: Unknown shader type '${shaderType}'!`);
            } else {
                console.debug('$.WebGLModule::addShader: Adding shader type:', shaderType, 'with id:', shaderID);
                // console.debug('$.WebGLModule::addShader: Shader:', Shader);
            }

            const shader = new Shader(shaderType.replaceAll('-', '_') + '_' + shaderID, {
                shaderObject: shaderObject,
                webglContext: this.webglContext,
                controls: shaderObject._controls,
                interactive: this.supportsHtmlControls(),
                cache: shaderObject._cache,
                // rerender the viewport
                invalidate: this.resetCallback,
                // need to rebuild the WebGL program, because shaderLayer has changed (eg. use different channel for texture sampling)
                rebuild: () => {
                    this.recreateProgram();
                },
                refetch: this.refetchCallback // need to reinitialize whole drawer? probably not needed
            });
            shader.newConstruct();
            shader.newAddControl(shaderObject, shaderID, this.htmlControlsElement, this.resetCallback);

            this.shadersCounter[shaderID] = shader;
            this.recreateProgram();

            // console.log('renderer.js::addShader(): PROGRAM UPDATED!');
            return shader;
        }

        /**
         * Description:
         * @param {object} shaderObject json object corresponding to a concrete data source
         * @param {string} shaderType eg.: identity, edge, negative,...
         * @param {string} shaderID "<tiledImageIndex>_<sourceIndex>"
         * @returns {ShaderLayer} instantion of shaderLayer
         */
        createShader(shaderObject, shaderType, shaderID) {
            const newShader = this.addShader(shaderObject, shaderType, shaderID);
            return newShader;
        }

        /**
         * Remove shader's controls corresponding to dataSource. If needed, remove shader from this.shadersCounter and recreate program.
         * @param {object} shaderObject json object corresponding to a concrete data source
         * @param {string} shaderID "<tiledImageIndex>_<sourceIndex>"
         */
        removeShader(shaderObject, shaderID) {
            const shader = this.shadersCounter[shaderID];
            shader.newRemoveControl(shaderObject, shaderID);

            delete this.shadersCounter[shaderID];
            this.recreateProgram();
            console.log('removeShader, this.shadersCounter po odobrati =', this.shadersCounter);
        }

        printWebglShadersOfCurrentProgram() {
            const opts = this._programs[0]._osdOptions;
            $.console.info("VERTEX SHADER\n", opts.vs);
            $.console.info("FRAGMENT SHADER\n", opts.fs);
        }


        setDataBlendingEnabled(enabled) {
            if (enabled) {
                // this.gl.enable(this.gl.BLEND);
                // this.gl.blendEquation(this.gl.FUNC_ADD);
                // this.gl.blendFuncSeparate(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA, this.gl.ONE, this.gl.ONE);

                // this blending setup is typically used for standard alpha blending, where the transparency of the source (source pixel = the one being drawn)
                // determines how much of the destination color shows through
                this.gl.enable(this.gl.BLEND);
                this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
            } else {
                this.gl.disable(this.gl.BLEND);
            }
        }
    };
    /**
     * ID pattern allowed for module, ID's are used in GLSL
     * to distinguish uniquely between static generated code parts
     * @type {RegExp}
     */
    $.WebGLModule.idPattern = /^(?!_)(?:(?!__)[0-9a-zA-Z_])*$/;

})(OpenSeadragon);
