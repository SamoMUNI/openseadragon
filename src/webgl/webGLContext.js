// 700 riadkov

(function($) {
    /**
     * Creates an array of size "n" that looks exactly like this -> [0, 1, 2, ... , n-1]
     * @param {number} n
     * @returns {[number]}
     */
    function iterate(n) {
        let result = Array(n),
            it = 0;
        while (it < n) {
            result[it] = it++;
        }
        return result;
    }

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error("webGLContext::createShader(): Shader compilation error:", gl.getShaderInfoLog(shader));
          return null;
        }
        return shader;
    }

    function createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          console.error("webGLContext::createProgram(): Program linking error:", gl.getProgramInfoLog(program));
          return null;
        }
        return program;
    }

    /**
     * @interface OpenSeadragon.WebGLModule.WebGLImplementation
     * Interface for the visualisation rendering implementation which can run
     * on various GLSL versions
     */
    $.WebGLModule.WebGLImplementation = class {

        /**
         * Create a WebGL Renderer Context Implementation (version-dependent)
         * @param {WebGLModule} renderer
         * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
         * @param {string} webglVersion "1.0" or "2.0"
         * @param {object} options
         * @param {GLuint} options.wrap  texture wrap parameteri
         * @param {GLuint} options.magFilter  texture filter parameteri
         * @param {GLuint} options.minFilter  texture filter parameteri
         */
        constructor(renderer, gl, webglVersion, options) {
            //Set default blending to be MASK
            this.renderer = renderer;
            this.gl = gl;
            this.webglVersion = webglVersion;
            this.options = options;
        }

        /**
         * Static context creation (to avoid class instantiation in case of missing support)
         * @param canvas
         * @param options desired options used in the canvas webgl context creation
         * @return {WebGLRenderingContext|WebGL2RenderingContext}
         */
        static create(canvas, options) {
            throw("$.WebGLModule.WebGLImplementation::create() must be implemented!");
        }

        /**
         * @return {string} WebGL version used
         */
        getVersion() {
            throw("$.WebGLModule.WebGLImplementation::getVersion() must be implemented!");
        }

        /**
         * Get GLSL texture sampling code
         * @return {string} GLSL code that is correct in texture sampling wrt. WebGL version used
         */
        get texture() {
            return this._texture;
        }

        getCompiled(program, name) {
            throw("$.WebGLModule.WebGLImplementation::getCompiled() must be implemented!");
        }

        /**
         * Create a visualisation from the given JSON params
         * @param program
         * @param {string[]} order keys of visualisation.shader in which order to build the visualization
         *   the order: painter's algorithm: the last drawn is the most visible
         * @param {object} visualisation
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @return {number} amount of usable shaders
         */
        compileSpecification(program, order, visualisation, options) {
            throw("$.WebGLModule.WebGLImplementation::compileSpecification() must be implemented!");
        }

        /**
         * Called once program is switched to: initialize all necessary items
         * @param {WebGLProgram} program  used program
         * @param {OpenSeadragon.WebGLModule.RenderingConfig?} currentConfig  JSON parameters used for this visualisation
         */
        programLoaded(program, currentConfig = null) {
            throw("$.WebGLModule.WebGLImplementation::programLoaded() must be implemented!");
        }

        /**
         * Draw on the canvas using given program
         * @param {WebGLProgram} program  used program
         * @param {OpenSeadragon.WebGLModule.RenderingConfig?} currentConfig  JSON parameters used for this visualisation
         * @param {GLuint} texture
         * @param {object} tileOpts
         * @param {number} tileOpts.zoom value passed to the shaders as u_zoom_level
         * @param {number} tileOpts.pixelSize value passed to the shaders as u_pixel_size_in_fragments
         * @param {OpenSeadragon.Mat3|[OpenSeadragon.Mat3]} tileOpts.transform position transform
         * @param {number?} tileOpts.instanceCount how many instances to draw in case instanced drawing is enabled
         *   matrix or flat matrix array (instance drawing)
         */
        programUsed(program, currentConfig, texture, tileOpts = {}) {
            throw("$.WebGLModule.WebGLImplementation::programUsed() must be implemented!");
        }

        sampleTexture(index, vec2coords) {
            throw("$.WebGLModule.WebGLImplementation::sampleTexture() must be implemented!");
        }

        /**
         *
         * @param {WebGLProgram} program
         * @param definition
         * @param execution
         * @param {object} options
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         */
        compileFragmentShader(program, definition, execution, options) {
            throw("$.WebGLModule.WebGLImplementation::compileFragmentShader() must be implemented!");
        }

        /**
         *
         * @param {WebGLProgram} program
         * @param definition
         * @param execution
         * @param {object} options
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         */
        compileVertexShader(program, definition, execution, options) {
            throw("$.WebGLModule.WebGLImplementation::compileVertexShader() must be implemented!");
        }

        /**
         * Code to be included only once, required by given shader type (keys are considered global).
         * @param {string} type shader type
         * @returns {object} global-scope code used by the shader in <key: code> format
         */
        /* Vracia pre konkretny zadany shader jeho __globalIncludes */
        globalCodeRequiredByShaderType(type) {
            return $.WebGLModule.ShaderMediator.getClass(type).__globalIncludes;
        }

        /**
         * Blend equation sent from the outside, must be respected
         * @param glslCode code for blending, using two variables: 'foreground', 'background'
         * @example
         * //The shader context must define the following:
         *
         * vec4 some_blending_name_etc(in vec4 background, in vec4 foreground) {
         *     // << glslCode >>
         * }
         *
         * void blend_clip(vec4 input) {
         *     //for details on clipping mask approach see show() below
         *     // <<use some_blending_name_etc() to blend input onto output color of the shader using a clipping mask>>
         * }
         *
         * void blend(vec4 input) { //must be called blend, API
         *     // <<use some_blending_name_etc() to blend input onto output color of the shader>>
         * }
         *
         * //Also, default alpha blending equation 'show' must be implemented:
         * void show(vec4 color) {
         *    //pseudocode
         *    //note that the blending output should not immediatelly work with 'color' but perform caching of the color,
         *    //render the color given in previous call and at the execution end of main call show(vec4(.0))
         *    //this way, the previous color is not yet blended for the next layer show/blend/blend_clip which can use it to create a clipping mask
         *
         *    compute t = color.a + background.a - color.a*background.a;
         *    output vec4((color.rgb * color.a + background.rgb * background.a - background.rgb * (background.a * color.a)) / t, t)
         * }
         */
        setBlendEquation(glslCode) {
            this.glslBlendCode = glslCode;
        }

        /** Taky ten boilerplate code na attachnutie shaderov a linknutie programu -> spojazdnenie WebGLProgram-u. + Vychytava chyby pri buildeni.
         * Attach shaders and link WebGLProgram, catch errors.
         * @param {WebGLProgram} program
         * @param {function(error: string, description: string)} onError callback to call when error happens, sets corresponding
         * specification.error = error;
         * specification.desc = description;
         */
        _compileProgram(program, onError) {
            const gl = this.gl;
            /* Napriklad gl.getProgramParameter(program, gl.LINK_STATUS) pre kind = "Program", status = "LINK", value = program */
            function ok(kind, status, value, sh) {
                if (!gl['get' + kind + 'Parameter'](value, gl[status + '_STATUS'])) {
                    $.console.error((sh || 'LINK') + ':\n' + gl['get' + kind + 'InfoLog'](value));
                    return false;
                }
                return true;
            }

            /* Attach shader to the WebGLProgram, return true if valid. */
            function useShader(gl, program, data, type) {
                let shader = gl.createShader(gl[type]);
                gl.shaderSource(shader, data);
                gl.compileShader(shader);
                gl.attachShader(program, shader);
                program[type] = shader;
                return ok('Shader', 'COMPILE', shader, type);
            }

            function numberLines(str) {
                // from https://stackoverflow.com/questions/49714971/how-to-add-line-numbers-to-beginning-of-each-line-in-string-in-javascript
                return str.split('\n').map((line, index) => `${index + 1} ${line}`).join('\n');
            }

            const opts = program._osdOptions;
            if (!opts) {
                $.console.error("Invalid program compilation! Did you build shaders using compile[Type]Shader() methods?");
                onError("Invalid program.", "Program not compatible with this renderer!");
                return;
            }

            // Attaching shaders to WebGLProgram failed
            if (!useShader(gl, program, opts.vs, 'VERTEX_SHADER') ||
                !useShader(gl, program, opts.fs, 'FRAGMENT_SHADER')) {
                onError("Unable to use this specification.",
                    "Attaching of shaders to WebGLProgram failed. For more information, see logs in the $.console.");
                $.console.warn("VERTEX SHADER\n", numberLines( opts.vs ));
                $.console.warn("FRAGMENT SHADER\n", numberLines( opts.fs ));
            } else { // Shaders attached
                gl.linkProgram(program);
                if (!ok('Program', 'LINK', program)) {
                    onError("Unable to use this specification.",
                        "Linking of WebGLProgram failed. For more information, see logs in the $.console.");
                } else { //if (this.renderer.debug) { //todo uncomment in production
                    // $.console.info("VERTEX SHADER\n", numberLines( opts.vs ));
                    // $.console.info("FRAGMENT SHADER\n", numberLines( opts.fs ));
                }
            }
        }
    };

    $.WebGLModule.WebGL20 = class extends $.WebGLModule.WebGLImplementation {
        /**
         *
         * @param {OpenSeadragon.WebGLModule} renderer
         * @param {WebGL2RenderingContext} gl
         * @param options
         */
        constructor(renderer, gl, options) {
            // console.log("konstruujem webgl20 implementaciu");
            super(renderer, gl, "2.0", options); // sets this.renderer, this.gl, this.webglVersion, this.options

            // SECOND PASS PROGRAM
            this._secondPassProgram = null;
            this._shadersMapping = {default: -1}; // {identity: 0, edge: 1, ...} maps shaderType to u_shaderLayerIndex

            this._bufferTextureCoords = null; // :glBuffer, pre kazdu tile-u sa sem nahraju data jej textureCoords
            this._locationTextureCoords = null; // :glAttribLocation, atribut na previazanie s buffrom hore, nahra sa skrze neho do glsl
            this._locationTransformMatrix = null; // u_transform_matrix

            this._locationPixelSize = null; // u_pixel_size_in_fragments ?
            this._locationZoomLevel = null; // u_zoom_level ?
            this._locationTextureArray = null; // u_textureArray TEXTURE_2D_ARRAY
            this._locationTextureLayer = null; // u_textureLayer which layer from TEXTURE_2D_ARRAY to use
            this._locationShaderLayerIndex = null; // u_shaderLayerIndex which shaderLayer to use for rendering


            // FIRST PASS PROGRAM, used to render data from tiledImages to their corresponding layers in TEXTURE_2D_ARRAY
            this._firstPassProgram = null;
            this._firstPassProgramTexcoordLocation = null;
            this._firstPassProgramTransformMatrixLocation = null;
            this._firstPassProgramTextureLocation = null;
            this._firstPassProgramTexcoordBuffer = null;
            this._createFirstPassProgram(); // sets this._firstPassProgram to WebGL program
        }

        /** Get WebGL2RenderingContext (static used to avoid instantiation of this class in case of missing support)
         * @param canvas
         * @param options desired options used in the canvas webgl2 context creation
         * @return {WebGL2RenderingContext}
         */
        static create(canvas, options) {
            /* a boolean value that indicates if the canvas contains an alpha buffer */
            options.alpha = true;
            /* a boolean value that indicates that the page compositor will assume the drawing buffer contains colors with pre-multiplied alpha */
            options.premultipliedAlpha = true;
            return canvas.getContext('webgl2', options);
        }

        getVersion() {
            return "2.0";
        }

        // tomuto nerozumiem celkom naco tu je, je volana z rendereru myslim
        getCompiled(program, name) {
            return program._osdOptions[name];
        }

        /* ??? */
        sampleTexture(index, vec2coords) {
            return `osd_texture(${index}, ${vec2coords})`;
        }

        /** Sets this._firstPassProgram to WebGL program.
         * Creates WebGL program that will be used as first pass program during two pass rendering (render into texture).
         */
        _createFirstPassProgram() {
            const vsource = `#version 300 es
    precision mediump float;

    const vec3 viewport[4] = vec3[4] (
        vec3(0.0, 1.0, 1.0),
        vec3(0.0, 0.0, 1.0),
        vec3(1.0, 1.0, 1.0),
        vec3(1.0, 0.0, 1.0)
    );

    uniform mat3 u_transform_matrix;

    in vec2 a_texCoord;
    out vec2 v_texCoord;

    void main() {
        v_texCoord = a_texCoord;
        gl_Position = vec4(u_transform_matrix * viewport[gl_VertexID], 1);
    }
`;
            const fsource = `#version 300 es
    precision mediump float;
    precision mediump sampler2D;
    precision mediump sampler2DArray;

    in vec2 v_texCoord;

    uniform sampler2DArray u_textureArray;
    uniform int u_textureLayer;

    out vec4 outColor;

    void main() {
        outColor = texture(u_textureArray, vec3(v_texCoord, float(u_textureLayer)));
    }
`;
            const gl = this.gl;
            const vfp = createShader(gl, gl.VERTEX_SHADER, vsource);
            if (!vfp) {
                alert("Creation of first pass vertex shader failed upsi");
                throw new Error("Down");
            }
            const ffp = createShader(gl, gl.FRAGMENT_SHADER, fsource);
            if (!ffp) {
                alert("Creation of first pass fragment shader failed dupsi");
                throw new Error("Down");
            }
            const pfp = createProgram(gl, vfp, ffp);
            if (!pfp) {
                alert("Creation of first pass program failed och juj");
                throw new Error("Down");
            }

            this._firstPassProgram = pfp;
        }

        /** gl.useProgram(firstPassProgram) + initialize firstPassProgram's attributes.
         *
         */
        loadFirstPassProgram() {
            const gl = this.gl;
            const program = this._firstPassProgram;
            gl.useProgram(program);

            // Locations
            this._firstPassProgramTexcoordLocation = gl.getAttribLocation(program, "a_texCoord");
            this._firstPassProgramTransformMatrixLocation = gl.getUniformLocation(program, "u_transform_matrix");
            this._firstPassProgramTextureArrayLocation = gl.getUniformLocation(program, "u_textureArray");
            this._firstPassProgramTextureLayerLocation = gl.getUniformLocation(program, "u_textureLayer");


            // Initialize texture coords attribute
            this._firstPassProgramTexcoordBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._firstPassProgramTexcoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this._firstPassProgramTexcoordBuffer);
            gl.vertexAttribPointer(this._firstPassProgramTexcoordBuffer, 2, gl.FLOAT, false, 0, 0);

            // Initialize texture
            gl.uniform1i(this._firstPassProgramTextureArrayLocation, 0);
            gl.activeTexture(gl.TEXTURE0);
        }

        /** Draw using firstPassProgram.
         * @param {WebGLTexture} texture
         * @param {Float32Array} textureCoords
         * @param {Array} transformMatrix
         */
        drawFirstPassProgram(texture, textureArray, textureLayer, textureCoords, transformMatrix) {
            const gl = this.gl;

            // Texture coords
            gl.bindBuffer(gl.ARRAY_BUFFER, this._firstPassProgramTexcoordBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, textureCoords, gl.STATIC_DRAW);

            // Transform matrix
            gl.uniformMatrix3fv(this._firstPassProgramTransformMatrixLocation, false, transformMatrix);

            // Texture
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
            gl.uniform1i(this._firstPassProgramTextureLayerLocation, textureLayer);

            // Draw triangle strip (two triangles) from a static array defined in the vertex shader
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }


        /** Dolezita flow funkcia, je volana pri buildeni specifikacie v rendereri.
         * Prechadza cez shaders danej spec, komunikuje s ich instanciami
         * a robi podla nich glsl kod pre fragment shader (vola ich funkcie getFragmentShaderDefinition/Execution).
         * Natvrdo spravi glsl kod pre definition a execution pre vertex shader.
         * Vola funkcie compileVertex/FragmentShader, ktorym predava odpovedajuce definition, execution a
         * dostava full glsl kod pre vertex shader a fragment shader.
         *
         * Nastavuje program.osdOptions na options + .vs/.fs na glsl kod shaderov.
         * Vola _compileProgram ktory pripravi cely WebGLProgram k pouzitiu.
         *
         * Nedoriesene:
         * Generating HTML: html = getNewHtmlString() + html (reverse order append to show first the last drawn element (top))
         *
         * @param {WebGLProgram} program program corresponding to a specification
         * @param {object} specification concrete specification from this.renderer._programSpecifications
         * @param {object} specification.shaders object containing shaderObjects (here layers)
         * @param {[string]} specification.order array containing keys from specification.shaders
         * @param {object} options
         * @param {boolean} options.withHtml whether html should be also created (false if no UI controls are desired)
         * @param {string} options.textureType id of texture to be used, supported are TEXTURE_2D, TEXTURE_2D_ARRAY, TEXTURE_3D
         * @param {string} options.instanceCount number of instances to draw at once
         * @param {boolean} options.debug draw debugging info
         * @returns {number} number of usable shaders
         */
        //todo try to implement on the global scope version-independntly
        compileSpecification(program, specification, options) {
            console.log('CompileSpecification, specs=', this.renderer.getSpecifications());
            // fragment shader's code placed outside of the main function
            var definition = "\n",
            // fragment shader's code placed inside the main function
                execution = "",
                html = "",
                _this = this,
                usableShaders = 0,
                dataCount = 0,
                globalScopeCode = {};

            specification.order.forEach(shaderName => {
                // layer = shaderObject
                let layer = specification.shaders[shaderName];
                layer.rendering = false;

                if (layer.type === "none") { // skip the layer
                    //prevents the layer from being accounted for
                    layer.error = "Not an error - layer type none.";
                } else if (layer.error) { // layer with error
                    if (options.withHtml) {
                        html = _this.renderer.htmlShaderPartHeader(layer.error, shaderName, false, layer, false) + html;
                    }
                    $.console.warn(`specification.shaders.${shaderName} has en error:`, layer.error, "\nError description:", layer.desc);

                } else if (layer._renderContext && layer._index !== undefined) { // properly built layer
                    //todo consider html generating in the renderer
                    usableShaders++;

                    //make visible textures if 'visible' flag set
                    //todo either allways visible or ensure textures do not get loaded
                    if (layer.visible) {
                        layer.rendering = true;

                        let shader = layer._renderContext;

                        // returns string which corresponds to glsl code
                        const fsd = shader.getFragmentShaderDefinition();
                        definition += fsd;

                        // getFSE `return ${this.sampleChannel("osd_texture_coords")};` (from plainShader)
                        // getFSE = osd_texture(0, osd_texture_coords).rgba
                        definition += `
    vec4 lid_${layer._index}_xo() {
        ${shader.getFragmentShaderExecution()}
    }`;
                        console.log('order.foreach, definition po pridani:\n', definition);

                        if (shader.opacity) { // multiply alpha channel by opacity and than call blend function
                            execution += `
        vec4 l${layer._index}_out = lid_${layer._index}_xo();
        l${layer._index}_out.a *= ${shader.opacity.sample()};
        blend(l${layer._index}_out, ${shader._blendUniform}, ${shader._clipUniform});`;
                        } else { // immediately call blend function
                            execution += `
        blend(lid_${layer._index}_xo(), ${shader._blendUniform}, ${shader._clipUniform});`;
                        }

                        // prida do globalScopeCode shader.__globalIncludes [globalScopeCode je v fragment shader's definition (code outside main)]
                        $.extend(globalScopeCode, _this.globalCodeRequiredByShaderType(layer.type));
                        dataCount += layer.dataReferences.length;
                    }

                    if (options.withHtml) {
                        html = _this.renderer.htmlShaderPartHeader(layer._renderContext.htmlControls(),
                            shaderName, layer.visible, layer, true) + html;
                    }

                } else { // layer not skipped, not with error, but still not correctly built
                    if (options.withHtml) {
                        html = _this.renderer.htmlShaderPartHeader(`The requested specification type does not work properly.`,
                            shaderName, false, layer, false) + html;
                    }
                    $.console.warn(`specification.shaders.${shaderName} was not correctly built, shaderObject:`, layer);
                }
            }); // end of order.forEach

            if (!options.textureType) {
                if (dataCount === 1) {
                    options.textureType = "TEXTURE_2D";
                }
                if (dataCount > 1) {
                    options.textureType = "TEXTURE_2D_ARRAY";
                }
            }

            options.html = html;
            options.dataUrls = this.renderer._dataSources;
            options.onError = function(message, description) {
                specification.error = message;
                specification.desc = description;
            };


            const vertexShaderCode = this.compileVertexShader(options);

            //hack -> use 'invalid' key to attach item
            globalScopeCode[null] = definition;
            const fragmentShaderCode = this.compileFragmentShader(Object.values(globalScopeCode).join("\n"), execution, options);

            program._osdOptions = options;
            program._osdOptions.vs = vertexShaderCode;
            program._osdOptions.fs = fragmentShaderCode;
            this._compileProgram(program, options.onError || $.console.error);

            return usableShaders;
        }

        /** Get glsl code for texture sampling. Used in compileFragmentShader.
         * @param {null|string} options.textureType WebGL's texture type -> TEXTURE_2D or TEXTURE_2D_ARRAY or TEXTURE_3D
         * @returns {string} glsl code to texture sampling
         */
        getTextureSampling(options) {
            const type = options.textureType;
            if (!type) { //no texture is also allowed option todo test if valid, defined since we read its location
                /* preco je v naznve _ (_vis_data...) */
                return `
    ivec2 osd_texture_size() {
        return ivec2(0);
    }
    uniform sampler2D _vis_data_sampler[0];
    vec4 osd_texture(int index, vec2 coords) {
      return vec(.0);
    }`;
            }

            const numOfTextures = options.instanceCount =
                Math.max(options.instanceCount || 0, 1);

            function samplingCode(coords) {
                if (numOfTextures === 1) {
                    return `return texture(_vis_data_sampler[0], ${coords});`;
                }
                //sampling hardcode switch to sample with constant indexes
                return `switch(osd_texture_id) {
            ${iterate(options.instanceCount).map(i => `
            case ${i}:
                return texture(_vis_data_sampler[${i}], ${coords});`).join("")}
        }
        return vec4(1.0);`;
            }

            //todo consider sampling with vec3 for universality
            if (type === "TEXTURE_2D") {
                return `
    uniform sampler2D _vis_data_sampler[${numOfTextures}];
    ivec2 osd_texture_size() {
        return textureSize(_vis_data_sampler[0], 0);
    }
    vec4 osd_texture(int index, vec2 coords) {
        ${samplingCode('coords')}
    }`;
            }
            if (type === "TEXTURE_2D_ARRAY") {
                return `
    uniform sampler2DArray _vis_data_sampler[${numOfTextures}];
    ivec2 osd_texture_size() {
        return textureSize(_vis_data_sampler[0], 0).xy;
    }
    vec4 osd_texture(int index, vec2 coords) {
        ${samplingCode('vec3(coords, index)')}
    }`;
            } else if (type === "TEXTURE_3D") {
                //todo broken api, but pointless sending vec2 with 3d tex
                return `
    uniform sampler3D _vis_data_sampler[${numOfTextures}];
    ivec3 osd_texture_size() {
        return textureSize(_vis_data_sampler[0], 0).xy;
    }
    vec4 osd_texture(int index, vec2 coords) {
        ${samplingCode('vec3(coords, index)')}
    }`;
            }

            return 'Error: invalid texture: unsupported sampling type ' + type;
        }

        /** Get vertex shader's glsl code.
         * @param {object} options
         * @returns {string} vertex shader's glsl code
         */
        compileVertexShader(options) {
        const textureId = options.instanceCount > 1 ? 'gl_InstanceID' : '0';

        const vertexShaderCode = `#version 300 es
precision mediump float;
/* This program is used for single-pass rendering and for second pass during two-pass rendering. */

// 1 = single-pass, 2 = two-pass
uniform int u_nPassRendering;
flat out int nPassRendering;

flat out int v_texture_id;
in vec2 a_texture_coords;
out vec2 v_texture_coords;

uniform mat3 u_transform_matrix;

const vec3 single_pass_viewport[4] = vec3[4] (
    vec3(0.0, 1.0, 1.0),
    vec3(0.0, 0.0, 1.0),
    vec3(1.0, 1.0, 1.0),
    vec3(1.0, 0.0, 1.0)
);

const vec3 second_pass_viewport[4] = vec3[4] (
    vec3(0.0, 0.0, 1.0),
    vec3(0.0, 1.0, 1.0),
    vec3(1.0, 0.0, 1.0),
    vec3(1.0, 1.0, 1.0)
);

void main() {
    v_texture_id = ${textureId};
    v_texture_coords = a_texture_coords;
    nPassRendering = u_nPassRendering;

    if (nPassRendering == 1) {
        gl_Position = vec4(u_transform_matrix * single_pass_viewport[gl_VertexID], 1);
    } else {
        gl_Position = vec4(u_transform_matrix * second_pass_viewport[gl_VertexID], 1);
    }
}`;

        return vertexShaderCode;
        }


        /** Get fragment shader's glsl code.
         * @param {string} definition glsl code outta main function
         * @param {string} execution glsl code inside the main function
         * @param {object} options
         * @returns {string} fragment shader's glsl code
         */
        compileFragmentShader(definition, execution, options) {
    //         const debug = options.debug ? `
    //     float twoPixels = 1.0 / float(osd_texture_size().x) * 2.0;
    //     vec2 distance = abs(osd_texture_bounds - osd_texture_coords);
    //     if (distance.x <= twoPixels || distance.y <= twoPixels) {
    //         final_color = vec4(1.0, .0, .0, 1.0);
    //         return;
    //     }
    // ` : "";

            const fragmentShaderCode = `#version 300 es
    precision mediump float;
    precision mediump sampler2D;
    precision mediump sampler2DArray;

    uniform float u_pixel_size_in_fragments;
    uniform float u_zoom_level;

    flat in int v_texture_id;
    in vec2 v_texture_coords;

    uniform int u_shaderLayerIndex;

    // 1 = single-pass, 2 = two-pass
    flat in int nPassRendering;

    // for single-pass rendering
    uniform sampler2D u_texture;
    uniform sampler2DArray u_textureArray1;
    uniform int u_textureLayer1;

    // for two-pass rendering
    uniform sampler2DArray u_textureArray;
    uniform int u_textureLayer;

    vec4 osd_texture(int index, vec2 coords) {
        if (nPassRendering == 1) {
            return texture(u_textureArray1, vec3(coords, float(u_textureLayer1)));
            // return texture(u_texture, coords);
        } else if (nPassRendering == 2) {
            return texture(u_textureArray, vec3(coords, float(u_textureLayer)));
        } else { // more-pass renderings not implemented
            return vec4(0,1,0,0.5);
        }
    }

    // utility function
    bool close(float value, float target) {
        return abs(target - value) < 0.001;
    }

    // blending function, zabezpecuje ze to co je uz vyrenderovane sa zblenduje s tym co renderujem teraz ASI? NECHAPEM JAK TO MOZE FUNGOVAT A AKO TO FUNGUJE
    out vec4 final_color;
    vec4 _last_rendered_color = vec4(.0);
    int _last_mode = 0;
    bool _last_clip = false;
    void blend(vec4 color, int mode, bool clip) {
        //premultiplied alpha blending
        //if (_last_clip) {
        //  todo
        //} else {
            vec4 fg = _last_rendered_color;
            vec4 pre_fg = vec4(fg.rgb * fg.a, fg.a);

            if (_last_mode == 0) {
                final_color = pre_fg + (1.0-fg.a)*final_color;
            } else if (_last_mode == 1) {
                // final_color = vec4(pre_fg.rgb * final_color.rgb, pre_fg.a + final_color.a);
                final_color = vec4(.0, 1.0, 1.0, 1.0);
            } else {
                final_color = vec4(.0, .0, 1.0, 1.0);
            }
        //}
        _last_rendered_color = color;
        _last_mode = mode;
        _last_clip = clip;
    }


    // Definitions of shaderLayers:${definition !== '' ? definition : '\n    // Any non-default shaderLayer here to define...'}

    void main() {
        // Executions of shaderLayers:
        switch (u_shaderLayerIndex) {${execution}
            default:
                if (osd_texture(0, v_texture_coords).rgba == vec4(.0)) {
                    final_color = vec4(.0);
                } else { // render only where there's data in the texture
                    final_color = vec4(1, 0, 0, 0.5);
                }
                return;
        }

        //blend last level
        blend(vec4(.0), 0, false);
    }`;

            return fragmentShaderCode;
        }


        /**
         * Create WebGLProgram that uses shaderLayers defined in an input parameter.
         * @param {[ShaderLayer]} shaderLayers array of shaderLayers to use
         * @returns {WebGLProgram}
         */
        programCreated(shaderLayers) {
            const gl = this.gl;
            const program = gl.createProgram();

            let definition = '',
                execution = '';
                // globalScopeCode = {};


            shaderLayers.forEach((shaderLayer, shaderLayerIndex) => {
                definition += `\n    // Definition of ${shaderLayer.constructor.type()} shader:\n`;
                // returns string which corresponds to glsl code
                definition += shaderLayer.getFragmentShaderDefinition();
                definition += '\n';
                definition += `
    vec4 ${shaderLayer.uid}_execution() {${shaderLayer.getFragmentShaderExecution()}
    }`;
                definition += '\n\n';

                execution += `
            case ${shaderLayerIndex}:`;
                // ak ma opacity shaderLayer tak zavolaj jeho execution a prenasob alpha channel opacitou a to posli do blend funkcie, inak tam posli rovno jeho execution
                //TODO ZMENA PRI CONTROLS
                if (shaderLayer.opacity) {
                    execution += `
                vec4 ${shaderLayer.uid}_out = ${shaderLayer.uid}_execution();
                ${shaderLayer.uid}_out.a *= ${shaderLayer.opacity.sample()};
                blend(${shaderLayer.uid}_out, ${shaderLayer._blendUniform}, ${shaderLayer._clipUniform});`;
                } else {
                    execution += `
                blend(${shaderLayer.uid}_execution(), ${shaderLayer._blendUniform}, ${shaderLayer._clipUniform});`;
                }
                // execution += `
                // final_color = ${shaderLayer.uid}_execution();`; pokial nechcem pouzit blend funkciu ale rovno ceknut vystup shaderu
                execution += `
                break;`;

                this._shadersMapping[shaderLayer.constructor.type()] = shaderLayerIndex;
            }); // end of for cycle

            const vertexShaderCode = this.compileVertexShader({});
            const fragmentShaderCode = this.compileFragmentShader(definition, execution, {});
            // toto by som spravil inak, ale kedze uz je naimplementovana funkcia _compileProgram tak ju pouzijem
            program._osdOptions = {};
            program._osdOptions.vs = vertexShaderCode;
            program._osdOptions.fs = fragmentShaderCode;
            this._compileProgram(program, $.console.error);

            this._secondPassProgram = program;
            return program;
        }

        /**
         * Single-pass rendering uses gl.TEXTURE1 unit to which it binds TEXTURE_2D,
         * two-pass rendering uses gl.TEXTURE2 unit to which it binds TEXTURE_2D_ARRAY.
         * @param {int} n 1 = single-pass, 2 = two-pass
         */
        setRenderingType(n) {
            const gl = this.gl;
            // console.log('Nahravam do nPassRendering cislo', n);
            gl.uniform1i(this._locationNPassRendering, n);
            gl.activeTexture(gl.TEXTURE0 + n);
        }

        /**
         * Load the locations of glsl variables and initialize buffers.
         * Need to also call this.setRenderingType(n) after this function call to prepare the whole program correctly.
         * @param {WebGLProgram} program WebGLProgram in use
         * @param {[ShaderLayer]} shaderLayers shaderLayers to load
         */
        programLoaded(program, shaderLayers) {
            const gl = this.gl;


            for (const shaderLayer of shaderLayers) {
                //console.log('Calling glLoaded on shaderLayer', shaderLayer.constructor.name(), shaderLayer);
                shaderLayer.glLoaded(program, gl);
            }


            // VERTEX shader's locations
            this._locationTextureCoords = gl.getAttribLocation(program, "a_texture_coords");
            this._locationTransformMatrix = gl.getUniformLocation(program, "u_transform_matrix");
            this._locationNPassRendering = gl.getUniformLocation(program, "u_nPassRendering");


            // FRAGMENT shader's locations
            this._locationPixelSize = gl.getUniformLocation(program, "u_pixel_size_in_fragments");
            this._locationZoomLevel = gl.getUniformLocation(program, "u_zoom_level");

            this._locationTexture = gl.getUniformLocation(program, "u_texture");
            this._locationTextureArray1 = gl.getUniformLocation(program, "u_textureArray1");
            this._locationTextureLayer1 = gl.getUniformLocation(program, "u_textureLayer1");
            this._locationTextureArray = gl.getUniformLocation(program, "u_textureArray");
            this._locationTextureLayer = gl.getUniformLocation(program, "u_textureLayer");

            this._locationShaderLayerIndex = gl.getUniformLocation(program, "u_shaderLayerIndex");


            // Initialize texture_coords attribute
            this._bufferTextureCoords = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            // Fill the buffer with initial thrash and then call vertexAttribPointer.
            // This ensures correct buffer's initialization -> binds this._locationTextureCoords to this._bufferTextureCoords and tells webgl how to read the data from the buffer.
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this._locationTextureCoords);
            gl.vertexAttribPointer(this._locationTextureCoords, 2, gl.FLOAT, false, 0, 0);


            // Initialize textures:
            // Single-pass rendering uses gl.TEXTURE1 unit to which it binds TEXTURE_2D,
            // two-pass rendering uses gl.TEXTURE2 unit to which it binds TEXTURE_2D_ARRAY.
            // gl.uniform1i(this._locationTexture, 1);
            gl.uniform1i(this._locationTextureArray1, 1);
            gl.uniform1i(this._locationTextureArray, 2);
        }


        /**
         * Fill the glsl variables and draw.
         * @param {WebGLProgram} program WebGLProgram in use

         * @param {object} tileInfo
         * @param {[Float]} tileInfo.transform 3*3 matrix that should be applied to tile vertices
         * @param {number} tileInfo.zoom
         * @param {number} tileInfo.pixelSize
         * @param {Float32Array} tileInfo.textureCoords 8 suradnic, (2 pre kazdy vrchol triangle stripu)

         * @param {WebGLTexture} texture gl.TEXTURE_2D
         * @param {WebGLTextureArray} textureArray gl.TEXTURE_2D_ARRAY
         * @param {number} textureLayer which layer from textureArray to use
         */
        programUsed(program, tileInfo, shaderLayer, controlId, textureArray1, textureLayer1, textureArray, textureLayer) {
            if (!this.renderer.running) {
                throw new Error("webGLContext::programUsed: Renderer not running!");
            }
            // console.log('PROGRAMUSED call!');

            const gl = this.gl;
            // if (spec) {
            //     console.log('spec =', spec);
            //     // fill shader's control's uniforms
            //     this.renderer.glDrawing(gl, program, spec);
            // }
            if (shaderLayer) {
                //console.log('Calling glDrawing on shaderLayer', shaderLayer.constructor.name(), shaderLayer);
                shaderLayer.glDrawing(program, gl, controlId);
                const shaderLayerIndex = this._shadersMapping[shaderLayer.constructor.type()];
                // index of shaderLayer to use
                // console.log('programUsed: do shaderLayerIndexu nahram cislo', shaderLayerIndex);
                gl.uniform1i(this._locationShaderLayerIndex, shaderLayerIndex);
            }

            // fill FRAGMENT shader's uniforms (that are unused)
            gl.uniform1f(this._locationPixelSize, tileInfo.pixelSize || 1);
            gl.uniform1f(this._locationZoomLevel, tileInfo.zoom || 1);

            // const textureType = program._osdOptions.textureType; // nechal som aby som videl ze existuju nejake _osdOptions a v nich shity
            // const instanceCount = program._osdOptions.instanceCount;
            // gl.clear(gl.COLOR_BUFFER_BIT); //-> vzdy uvidim len poslednu vec co som drawoval potom hihi

            // texture coords
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            gl.bufferData(gl.ARRAY_BUFFER, tileInfo.textureCoords, gl.STATIC_DRAW);

            // transform matrix
            gl.uniformMatrix3fv(this._locationTransformMatrix, false, tileInfo.transform);

            if (textureArray1) {
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray1);
                gl.uniform1i(this._locationTextureLayer1, textureLayer1);
            } else {
                gl.bindTexture(gl.TEXTURE_2D, textureArray1);
            }
            if (textureArray) {
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
                gl.uniform1i(this._locationTextureLayer, textureLayer);
            }



            // CONTROLS debugging
            // const blendLocE = gl.getUniformLocation(program, "edge_shader_blend");
            // const blendLocD = gl.getUniformLocation(program, "default_shader_blend");
            // console.error(blendLocD, blendLocE);
            // if (blendLocD !== null) {
            //     // gl.uniform1i(blendLocD, 0);
            // } else {
            //     console.error("blendLOcD je undefined");
            // }
            // if(blendLocE !== null) {
            //     // gl.uniform1i(blendLocE, 0);
            //     console.error(`blendE = ${gl.getUniform(program, blendLocE)}, blendD = ${gl.getUniform(program, blendLocD)}`);

            // } else {
            //     console.error("blendLOcE je undefined");
            // }


            // const colorLocE = gl.getUniformLocation(program, "color_edge_shader");
            // const colorLocD = gl.getUniformLocation(program, "color_default_shader");
            // console.error(colorLocD, colorLocE);
            // if (colorLocD !== null) {
            //     // gl.uniform3f(colorLocD, 0.0, 1.0, 0.0);
            // } else {
            //     console.error("colorLOcD je undefined");
            // }
            // if(colorLocE !== null) {
            //     // gl.uniform3f(colorLocE, 0.0, 1.0, 0.0);
            //     console.error(`colorE = ${gl.getUniform(program, colorLocE)}, colorD = ${gl.getUniform(program, colorLocD)}`);
            // } else {
            //     console.error("colorLOcE je undefined");
            // }

            // const thresholdLocE = gl.getUniformLocation(program, "threshold_edge_shader");
            // const thresholdLocD = gl.getUniformLocation(program, "threshold_default_shader");
            // console.error(thresholdLocD, thresholdLocE);
            // if (thresholdLocD !== null) {
            //     // gl.uniform1f(thresholdLocD, 0.5);
            // } else {
            //     console.error("thresholdLOcD je undefined");
            // }
            // if(thresholdLocE !== null) {
            //     // gl.uniform1f(thresholdLocE, 0.5);
            //     console.error(`thresholdE = ${gl.getUniform(program, thresholdLocE)}, thresholdD = ${gl.getUniform(program, thresholdLocD)}`);

            // } else {
            //     console.error("thresholdLOcE je undefined");
            // }

            // const edgeThicknessLocE = gl.getUniformLocation(program, "edgeThickness_edge_shader");
            // const edgeThicknessLocD = gl.getUniformLocation(program, "edgeThickness_default_shader");
            // console.error(edgeThicknessLocD, edgeThicknessLocE);
            // if (edgeThicknessLocD !== null) {
            //     // gl.uniform1f(edgeThicknessLocD, 0.2);
            // } else {
            //     console.error("edgeThicknessLOcD je undefined");
            // }
            // if(edgeThicknessLocE !== null) {
            //     // gl.uniform1f(edgeThicknessLocE, 0.2);
            //     console.error(`edgeThicknessE = ${gl.getUniform(program, edgeThicknessLocE)}, edgeThicknessD = ${gl.getUniform(program, edgeThicknessLocD)}`);
            // } else {
            //     console.error("edgeThicknessLOcE je undefined");
            // }

            // draw triangle strip (two triangles) from a static array defined in the vertex shader,
            // 0: start reading vertex data from the first vertex,
            // 4: use 4 vertices per instance (to form one triangle strip)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    };

})(OpenSeadragon);
