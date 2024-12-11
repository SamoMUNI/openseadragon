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
         * @param {String} webGLVersion "1.0" or "2.0"
         * @param {Object} options
         * @param {GLuint} options.wrap  texture wrap parameteri
         * @param {GLuint} options.magFilter  texture filter parameteri
         * @param {GLuint} options.minFilter  texture filter parameteri
         */
        constructor(renderer, gl, webGLVersion, options) {
            //Set default blending to be MASK
            this.renderer = renderer;
            this.gl = gl;
            this.webGLVersion = webGLVersion;
            this.options = options;
        }

        /**
         * Static context creation (to avoid class instantiation in case of missing support).
         * @param {HTMLCanvasElement} canvas
         * @param {Object} contextAttributes desired options used for the canvas webgl context creation
         * @return {WebGLRenderingContext|WebGL2RenderingContext}
         */
        static create(canvas, webGLVersion, contextAttributes) {
            // indicates that the canvas contains an alpha buffer
            contextAttributes.alpha = true;
            // indicates that the page compositor will assume the drawing buffer contains colors with pre-multiplied alpha
            contextAttributes.premultipliedAlpha = true;

            if (webGLVersion === "1.0") {
                return canvas.getContext('webgl', contextAttributes);
            } else {
                return canvas.getContext('webgl2', contextAttributes);
            }
        }

        /**
         * Get WebGL version used.
         * @return {String} WebGL version used
         */
        getVersion() {
            throw("$.WebGLModule.WebGLImplementation::getVersion() must be implemented!");
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
         * @return {boolean} true if program was built successfully
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
                return false;
            }

            // Attaching shaders to WebGLProgram failed
            if (!useShader(gl, program, opts.vs, 'VERTEX_SHADER') ||
                !useShader(gl, program, opts.fs, 'FRAGMENT_SHADER')) {
                onError("Unable to correctly build WebGL shaders.",
                    "Attaching of shaders to WebGLProgram failed. For more information, see logs in the $.console.");
                $.console.warn("VERTEX SHADER\n", numberLines( opts.vs ));
                $.console.warn("FRAGMENT SHADER\n", numberLines( opts.fs ));
                return false;
            } else { // Shaders attached
                gl.linkProgram(program);
                if (!ok('Program', 'LINK', program)) {
                    onError("Unable to correctly build WebGL program.",
                        "Linking of WebGLProgram failed. For more information, see logs in the $.console.");
                    return false;
                } else { //if (this.renderer.debug) { //todo uncomment in production
                    $.console.debug("VERTEX SHADER\n", numberLines( opts.vs ));
                    $.console.debug("FRAGMENT SHADER\n", numberLines( opts.fs )); // TODO: uncomment
                    return true;
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

            this._renderingType = 0;

            // SECOND PASS PROGRAM
            this._secondPassProgram = null;
            this._shadersMapping = {}; // {identity_for_first_pass: <always -1>, identity: 0, edge: 1, ...} maps shaderType to u_shaderLayerIndex

            this._bufferTextureCoords = null; // :glBuffer, pre kazdu tile-u sa sem nahraju data jej textureCoords
            this._locationTextureCoords = null; // :glAttribLocation, atribut na previazanie s buffrom hore, nahra sa skrze neho do glsl
            this._locationTransformMatrix = null; // u_transform_matrix

            this._locationPixelSize = null; // u_pixel_size_in_fragments ?
            this._locationZoomLevel = null; // u_zoom_level ?
            this._locationGlobalAlpha = null; // u_global_alpha

            this._locationTextureArray = null; // u_textureArray TEXTURE_2D_ARRAY to use as a source of data
            this._locationTextureLayer = null; // u_textureLayer which layer from TEXTURE_2D_ARRAY to use

            this._locationShaderLayerIndex = null; // u_shaderLayerIndex which shaderLayer to use for rendering
        }


        getVersion() {
            return "2.0";
        }

        /* ??? */
        sampleTexture(index, vec2coords) {
            return `osd_texture(${index}, ${vec2coords})`;
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
        const vertexShaderCode = `#version 300 es
    precision mediump int;
    precision mediump float;
    /* This program is used for single-pass rendering and for second pass during two-pass rendering. */

    // 1 = single-pass, 2 = two-pass
    uniform int u_nPassRendering;
    flat out int nPassRendering;

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
        v_texture_coords = a_texture_coords;
        nPassRendering = u_nPassRendering;

        // if (nPassRendering == 1 || nPassRendering == 2) {
        //     gl_Position = vec4(u_transform_matrix * single_pass_viewport[gl_VertexID], 1);
        // } else {
        //     gl_Position = vec4(u_transform_matrix * second_pass_viewport[gl_VertexID], 1);
        // }

            gl_Position = vec4(u_transform_matrix * single_pass_viewport[gl_VertexID], 1.0);
            // v_texture_coords = single_pass_viewport[gl_VertexID].xy;
            v_texture_coords = a_texture_coords;
    }`;

        return vertexShaderCode;
        }


        /** Get fragment shader's glsl code.
         * @param {string} definition glsl code outta main function
         * @param {string} execution glsl code inside the main function
         * @param {object} options
         * @returns {string} fragment shader's glsl code
         */
        compileFragmentShader(definition, execution, defferedBlending, globalScopeCode) {
            const fragmentShaderCode = `#version 300 es
    precision mediump int;
    precision mediump float;
    precision mediump sampler2DArray;

    uniform float u_pixel_size_in_fragments;
    uniform float u_zoom_level;
    uniform float u_global_alpha;

    uniform int u_shaderLayerIndex;

    // 1 = single-pass, 2 = two-pass
    flat in int nPassRendering;

    // TEXTURES
    in vec2 v_texture_coords;

    uniform sampler2DArray u_textureArray;
    uniform int u_textureLayer;

    vec4 osd_texture(int index, vec2 coords) {
        return texture(u_textureArray, vec3(coords, float(u_textureLayer)));
    }

    // utility function
    bool close(float value, float target) {
        return abs(target - value) < 0.001;
    }

    vec4 overall_color = vec4(.0);
    vec4 last_color = vec4(.0);
    vec4 current_color = vec4(.0);
    int last_blend_func_id = -1000;
    void deffered_blend();

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
                final_color = vec4(pre_fg.rgb * final_color.rgb, pre_fg.a + final_color.a);
            } else {
                final_color = vec4(.0, .0, 1.0, 1.0);
            }
        //}
        _last_rendered_color = color;
        _last_mode = mode;
        _last_clip = clip;
    }

    // GLOBAL SCOPE CODE:${Object.keys(globalScopeCode).length !== 0 ?
        Object.values(globalScopeCode).join("\n") : '\n    // No global scope code here...'}

    // DEFINITIONS OF SHADERLAYERS:${definition !== '' ? definition : '\n    // Any non-default shaderLayer here to define...'}

    // DEFFERED BLENDING:
    void deffered_blend() {
        switch (last_blend_func_id) {
        // predefined "additive blending":
        case -1:
            overall_color = last_color + overall_color;
            break;

        // predefined "premultiplied alpha blending":
        case -2:
            vec4 pre_fg = vec4(last_color.rgb * last_color.a, last_color.a);
            overall_color = pre_fg + overall_color * (1.0 - pre_fg.a);
            break;


        // non-predefined, custom blending functions:${defferedBlending === '' ? '\n            // No custom blending function here...' : defferedBlending}
        }
    }


    void main() {
        // EXECUTIONS OF SHADERLAYERS:
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
        // blend(vec4(.0), 0, false);
        deffered_blend();
        final_color = overall_color;

        final_color *= u_global_alpha;
    }`;

            return fragmentShaderCode;
        }


        /**
         * Create WebGLProgram that uses shaderLayers defined in an input parameter.
         * @param {Object} shaderLayers map of shaderLayers to use {shaderID: ShaderLayer}
         * @returns {WebGLProgram}
         */
        programCreated(shaderLayers) {
            const gl = this.gl;
            const program = gl.createProgram();

            let definition = '',
                execution = '',
                defferedBlending = '',
                html = '';

            // first pass identity shader is a special case, no blend nor clip, no controls, just pure identity, generate glsl manually here
            definition += `\n    // Definition of identity shader used for the first-pass:`;
            definition += `
    vec4 first_pass_identity_execution() {${this.renderer._firstPassShader.getFragmentShaderExecution()}
    }`;
            definition += '\n\n';

            execution += `
            case -1:`;
            execution += `
                final_color = first_pass_identity_execution();
                return;\n`;


            // generate glsl code for each shaderLayer
            let i = 0;
            for (const shaderID in shaderLayers) {
                const shaderLayer = shaderLayers[shaderID];
                const shaderLayerIndex = i++;
                const shaderObject = shaderLayer.__shaderObject;

                // tell which shaderLayer is used with which shaderLayerIndex
                this._shadersMapping[shaderID] = shaderLayerIndex;
                shaderLayer.glslIndex = shaderLayerIndex;

                definition += `\n    // Definition of ${shaderLayer.constructor.type()} shader:\n`;
                // returns string which corresponds to glsl code
                definition += shaderLayer.getFragmentShaderDefinition();
                definition += '\n';
                definition += `
    vec4 ${shaderLayer.uid}_execution() {${shaderLayer.getFragmentShaderExecution()}
    }`;
                definition += '\n\n';


                execution += `
            case ${shaderLayerIndex}:
                vec4 ${shaderLayer.uid}_out = ${shaderLayer.uid}_execution();`;

                if (shaderLayer.opacity) {
                    execution += `
                ${shaderLayer.uid}_out.a *= ${shaderLayer.opacity.sample()};`;
                }

                // execution += `
                // blend(${shaderLayer.uid}_out, ${shaderLayer._blendUniform}, ${shaderLayer._clipUniform});`;
                execution += `
                ${shaderLayer.uid}_blend_mode(${shaderLayer.uid}_out);
                break;`;

                // execution += `
                // final_color = ${shaderLayer.uid}_execution();
                // final_color *= u_global_alpha;
                // return;`; // pokial nechcem pouzit blend funkciu ale rovno ceknut vystup shaderu

                if (shaderLayer._mode === "mask") {
                    defferedBlending += `
        case ${shaderLayerIndex}:
            overall_color = ${shaderLayer.uid}_blend_func(last_color, overall_color);
            break;`;
                }

                // TODO: if (true) {
                    html += this.renderer.htmlShaderPartHeader(shaderLayer.newHtmlControls(),
                        shaderID,
                        shaderObject.visible,
                        shaderObject,
                        true,
                        shaderLayer);
                // }
            } // end of for cycle


            const vertexShaderCode = this.compileVertexShader({});
            const globalScopeCode = $.WebGLModule.ShaderLayer.__globalIncludes;
            const fragmentShaderCode = this.compileFragmentShader(definition, execution, defferedBlending, globalScopeCode);

            // toto by som spravil inak, ale kedze uz je naimplementovana funkcia _compileProgram tak ju pouzijem
            program._osdOptions = {};
            program._osdOptions.html = html;
            program._osdOptions.vs = vertexShaderCode;
            program._osdOptions.fs = fragmentShaderCode;

            const build = this._compileProgram(program, $.console.error);
            if (!build) {
                throw new Error("$.WebGLModule.WebGL20::programCreated: Program could not be built!");
            }

            this._secondPassProgram = program;
            return program;
        }

        /**
         * Single-pass rendering uses gl.TEXTURE1 unit,
         * two-pass rendering uses gl.TEXTURE2 unit.
         * @param {int} n 1 = single-pass, 2 = two-pass
         */
        setRenderingType(n) {
            const gl = this.gl;
            // console.log('Nahravam do nPassRendering cislo', n);
            gl.uniform1i(this._locationNPassRendering, n);
            // gl.activeTexture(gl.TEXTURE0 + n);
            this._renderingType = n;
        }

        /**
         * Load the locations of glsl variables and initialize buffers.
         * Need to also call this.setRenderingType(n) after this function call to prepare the whole program correctly.
         * @param {WebGLProgram} program WebGLProgram in use
         * @param {Object} shaderLayers map of shaderLayers to load {shaderID: ShaderLayer}
         */
        programLoaded(program, shaderLayers) {
            const gl = this.gl;

            // load clip and blend shaderLayer's glsl locations, load shaderLayer's control's glsl locations
            for (const shaderLayer of Object.values(shaderLayers)) {
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
            this._locationGlobalAlpha = gl.getUniformLocation(program, "u_global_alpha");

            this._locationTexture = gl.getUniformLocation(program, "u_texture");
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


            // Initialize texture arrays
            // single-pass rendering uses gl.TEXTURE1 unit to which it binds TEXTURE_2D_ARRAY,
            // two-pass rendering uses gl.TEXTURE2 unit to which it binds TEXTURE_2D_ARRAY.
            gl.uniform1i(this._locationTextureArray, 0);
            gl.activeTexture(gl.TEXTURE0);
            // gl.uniform1i(this._locationTextureArray2, 2);
        }


        /**
         * Fill the glsl variables and draw.
         * @param {WebGLProgram} program WebGLProgram in use

         * @param {object} tileInfo
         * @param {[Float]} tileInfo.transform 3*3 matrix that should be applied to tile vertices
         * @param {number} tileInfo.zoom
         * @param {number} tileInfo.pixelSize
         * @param {Float32Array} tileInfo.textureCoords 8 suradnic, (2 pre kazdy vrchol triangle stripu)
         *
         * @param {ShaderLayer} shaderLayer shaderLayer
         * @param {string} shaderID shaderLayer's ID
         * @param {WebGLTexture} textureArray gl.TEXTURE_2D_ARRAY used as source of data for rendering
         * @param {number} textureLayer index to layer in textureArray to use
         */
        programUsed(program, tileInfo, shaderLayer, shaderID, textureArray, textureLayer) {
            // console.debug('Drawujem programom webgl2! textureCoords:', tileInfo.textureCoords, 'transform=', tileInfo.transform, 'zoom=');
            const gl = this.gl;

            // tell the shaderLayer's controls to fill its uniforms
            shaderLayer.glDrawing(program, gl);

            // tell glsl which shaderLayer to use
            const shaderLayerIndex = this._shadersMapping[shaderID]; // malo by sediet ze controlID je to iste ako shaderID hadam...
            gl.uniform1i(this._locationShaderLayerIndex, shaderLayerIndex);

            // fill FRAGMENT shader's uniforms (that are unused)
            gl.uniform1f(this._locationPixelSize, tileInfo.pixelSize || 1);
            gl.uniform1f(this._locationZoomLevel, tileInfo.zoom || 1);
            gl.uniform1f(this._locationGlobalAlpha, tileInfo.globalOpacity || 1);

            // texture coords
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            gl.bufferData(gl.ARRAY_BUFFER, tileInfo.textureCoords, gl.STATIC_DRAW);
            // console.log('bufferTextureCoords:', tileInfo.textureCoords);

            // transform matrix
            gl.uniformMatrix3fv(this._locationTransformMatrix, false, tileInfo.transform);

            // texture
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
            gl.uniform1i(this._locationTextureLayer, textureLayer);


            // draw triangle strip (two triangles) from a static array defined in the vertex shader,
            // 0: start reading vertex data from the first vertex,
            // 4: use 4 vertices per instance (to form one triangle strip)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        /**
         * Draw using identity shaderLayer into an offScreenTexture (should be already bound).
         * @param {Float32Array} textureCoords
         * @param {Float32Array} transformMatrix
         * @param {WebGLTexture} textureArray gl.TEXTURE_2D_ARRAY used as a source of data for rendering
         * @param {number} textureLayer index to layer in textureArray to use
         */
        firstPassProgramUsed(textureCoords, transformMatrix, textureArray, textureLayer) {
            const gl = this.gl;

            // Use shaderLayer for the first pass
            gl.uniform1i(this._locationShaderLayerIndex, -1);

            // Texture coords
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            gl.bufferData(gl.ARRAY_BUFFER, textureCoords, gl.STATIC_DRAW);

            // Transform matrix
            gl.uniformMatrix3fv(this._locationTransformMatrix, false, transformMatrix);

            // Texture
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
            gl.uniform1i(this._locationTextureLayer, textureLayer);

            // Draw triangle strip (two triangles) from a static array defined in the vertex shader
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    };

    $.WebGLModule.WebGL10 = class extends $.WebGLModule.WebGLImplementation {
        /**
         *
         * @param {OpenSeadragon.WebGLModule} renderer
         * @param {WebGLRenderingContext} gl
         * @param options
         */
        constructor(renderer, gl, options) {
            // console.log("konstruujem webgl10 implementaciu");
            super(renderer, gl, "1.0", options); // sets this.renderer, this.gl, this.webglVersion, this.options

            this._renderingType = 0;

            this._firstPassViewport = new Float32Array([
                0.0, 1.0, 1.0,
                0.0, 0.0, 1.0,
                1.0, 1.0, 1.0,
                1.0, 0.0, 1.0
            ]);

            // SECOND PASS PROGRAM
            this._secondPassProgram = null;
            this._shadersMapping = {}; // {identity_for_first_pass: <always -1>, identity: 0, edge: 1, ...} maps shaderType to u_shaderLayerIndex

            this._bufferTextureCoords = null; // :glBuffer, pre kazdu tile-u sa sem nahraju data jej textureCoords
            this._locationTextureCoords = null; // :glAttribLocation, atribut na previazanie s buffrom hore, nahra sa skrze neho do glsl
            this._locationTransformMatrix = null; // u_transform_matrix

            this._locationPixelSize = null; // u_pixel_size_in_fragments ?
            this._locationZoomLevel = null; // u_zoom_level ?
            this._locationGlobalAlpha = null; // u_global_alpha

            this._locationShaderLayerIndex = null; // u_shaderLayerIndex which shaderLayer to use for rendering
        }

        getVersion() {
            return "1.0";
        }

        /* ??? */
        sampleTexture(index, vec2coords) {
            return `osd_texture(${index}, ${vec2coords})`;
        }


        /** ONLY FOR COMPILE FRAGMENT SHADER
         * @returns {string} glsl code for texture sampling
         */
        getTextureSampling() {
            const numOfTextures = this.instanceCount || 1;

            function sampleTextures() {
                let retval = `if (index == 0) {
            return texture2D(u_textures[0], coords);
        }`;

                if (numOfTextures === 1) {
                    return retval;
                }

                for (let i = 1; i < numOfTextures; i++) {
                    retval += ` else if (index == ${i}) {
            return texture2D(u_textures[${i}], coords);
        }`;
                }

                return retval;
            } // end of sampleTextures
            //todo consider sampling with vec3 for universality
            return `
    uniform sampler2D u_textures[${numOfTextures}];
    vec4 osd_texture(int index, vec2 coords) {
        ${sampleTextures()}
    }`;
        }

        /** Get vertex shader's glsl code.
         * @param {object} options
         * @returns {string} vertex shader's glsl code
         */
        compileVertexShader(options) {

        const vertexShaderCode = `
    precision mediump int;
    precision mediump float;
    /* This program is used for single-pass rendering and for second pass during two-pass rendering. */

    // 1 = single-pass, 2 = two-pass
    // uniform int u_nPassRendering;
    // varying int v_nPassRendering;

    // varying int ;
    attribute vec2 a_texture_coords;
    varying vec2 v_texture_coords;

    attribute vec3 a_position;
    uniform mat3 u_transform_matrix;

    void main() {
        v_texture_coords = a_texture_coords;
        // v_nPassRendering = u_nPassRendering;

        gl_Position = vec4(u_transform_matrix * a_position, 1);
}`;

        return vertexShaderCode;
        }


        /** Get fragment shader's glsl code.
         * @param {string} definition glsl code outta main function
         * @param {string} execution glsl code inside the main function
         * @param {object} options
         * @returns {string} fragment shader's glsl code
         */
        compileFragmentShader(definition, execution, defferedBlending, globalScopeCode) {
            const fragmentShaderCode = `
    precision mediump int;
    precision mediump float;
    precision mediump sampler2D;

    uniform float u_pixel_size_in_fragments;
    uniform float u_zoom_level;
    uniform float u_global_alpha;

    uniform int u_shaderLayerIndex;

    // 1 = single-pass, 2 = two-pass
    // varying int v_nPassRendering;

    // TEXTURES
    varying vec2 v_texture_coords;
    ${this.getTextureSampling()}


    // utility function
    bool close(float value, float target) {
        return abs(target - value) < 0.001;
    }

    vec4 overall_color = vec4(.0);
    vec4 last_color = vec4(.0);
    vec4 current_color = vec4(.0);
    int last_blend_func_id = -1000;
    void deffered_blend();

    // blending function, zabezpecuje ze to co je uz vyrenderovane sa zblenduje s tym co renderujem teraz ASI? NECHAPEM JAK TO MOZE FUNGOVAT A AKO TO FUNGUJE
    vec4 final_color;
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

    // GLOBAL SCOPE CODE:${Object.keys(globalScopeCode).length !== 0 ?
        Object.values(globalScopeCode).join("\n") :
        '\n    // No global scope code here...'}

    // DEFINITIONS OF SHADERLAYERS:${definition !== '' ? definition : '\n    // Any non-default shaderLayer here to define...'}

    // DEFFERED BLENDING:
    void deffered_blend() {
        // predefined "additive blending":
        if (last_blend_func_id == -1) {
            overall_color = last_color + overall_color;

        // predefined "premultiplied alpha blending":
        } else if (last_blend_func_id == -2) {
            vec4 pre_fg = vec4(last_color.rgb * last_color.a, last_color.a);
            overall_color = pre_fg + overall_color * (1.0 - pre_fg.a);


        // non-predefined, custom blending functions:
        }${defferedBlending === '' ? '\n            // No custom blending function here...' : defferedBlending}
    }


    void main() {
        // EXECUTIONS OF SHADERLAYERS:
        // default case -> should not happen
        if (u_shaderLayerIndex == -1000) {
            if (osd_texture(0, v_texture_coords).rgba == vec4(.0)) {
                final_color = vec4(.0);
            } else { // render only where there's data in the texture
                final_color = vec4(1, 0, 0, 0.5);
            }
            gl_FragColor = final_color;
            return;
        }${execution}

        //blend last level
        //blend(vec4(.0), 0, false);
        deffered_blend();
        final_color = overall_color;

        final_color *= u_global_alpha;
        gl_FragColor = final_color;
    }`;

            return fragmentShaderCode;
        }


        /**
         * Create WebGLProgram that uses shaderLayers defined in an input parameter.
         * @param {Object} shaderLayers map of shaderLayers to use {shaderID: ShaderLayer}
         * @returns {WebGLProgram}
         */
        programCreated(shaderLayers) {
            const gl = this.gl;
            const program = gl.createProgram();

            let definition = '',
                execution = '',
                defferedBlending = '',
                html = '';


            // first pass identity shader is a special case, no blend nor clip, no controls, just pure identity, generate glsl manually here
            definition += `\n    // Definition of identity shader used for the first-pass:`;
            definition += `
    vec4 first_pass_identity_execution() {${this.renderer._firstPassShader.getFragmentShaderExecution()}
    }`;
            definition += '\n\n';

            execution += ` else if (u_shaderLayerIndex == -1) {`;
            execution += `
            gl_FragColor = first_pass_identity_execution();
            return;
        }`;


            // generate glsl code for each shaderLayer
            let i = 0;
            for (const shaderID in shaderLayers) {
                const shaderLayer = shaderLayers[shaderID];
                const shaderLayerIndex = i++;
                const shaderObject = shaderLayer.__shaderObject;

                // tell which shaderLayer is used with which shaderLayerIndex
                this._shadersMapping[shaderID] = shaderLayerIndex;

                definition += `\n    // Definition of ${shaderLayer.constructor.type()} shader:\n`;
                // returns string which corresponds to glsl code
                definition += shaderLayer.getFragmentShaderDefinition();
                definition += '\n';
                definition += `
    vec4 ${shaderLayer.uid}_execution() {${shaderLayer.getFragmentShaderExecution()}
    }`;
                definition += '\n\n';


                execution += ` else if (u_shaderLayerIndex == ${shaderLayerIndex}) {
            vec4 ${shaderLayer.uid}_out = ${shaderLayer.uid}_execution();`;

                if (shaderLayer.opacity) {
                    execution += `
            ${shaderLayer.uid}_out.a *= ${shaderLayer.opacity.sample()};`;
                }

                execution += `
            ${shaderLayer.uid}_blend_mode(${shaderLayer.uid}_out);
        }`;


                if (shaderLayer._mode === "mask") {
                    defferedBlending += `
        else if (last_blend_func_id == ${shaderLayerIndex}) {
            overall_color = ${shaderLayer.uid}_blend_func(last_color, overall_color);
        }`;
                }

                // TODO: if (true) {
                    html += this.renderer.htmlShaderPartHeader(shaderLayer.newHtmlControls(),
                        shaderObject.shaderID,
                        shaderObject.visible,
                        shaderObject,
                        true,
                        shaderLayer);
                // }
            } // end of for cycle

            const vertexShaderCode = this.compileVertexShader({});
            const globalScopeCode = $.WebGLModule.ShaderLayer.__globalIncludes;
            const fragmentShaderCode = this.compileFragmentShader(definition, execution, defferedBlending, globalScopeCode);

            // toto by som spravil inak, ale kedze uz je naimplementovana funkcia _compileProgram tak ju pouzijem
            program._osdOptions = {};
            program._osdOptions.html = html;
            program._osdOptions.vs = vertexShaderCode;
            program._osdOptions.fs = fragmentShaderCode;

            const build = this._compileProgram(program, $.console.error);
            if (!build) {
                throw new Error("$.WebGLModule.WebGL10::programCreated: Program could not be built!");
            }

            this._secondPassProgram = program;
            return program;
        }

        /**
         * Single-pass rendering uses gl.TEXTURE1 unit,
         * two-pass rendering uses gl.TEXTURE2 unit.
         * @param {int} n 1 = single-pass, 2 = two-pass
         */
        setRenderingType(n) {
            const gl = this.gl;
            // console.log('Nahravam do nPassRendering cislo', n);
            // gl.uniform1i(this._locationNPassRendering, n);
            gl.activeTexture(gl.TEXTURE0);
            this._renderingType = n;
        }

        /**
         * Load the locations of glsl variables and initialize buffers.
         * Need to also call this.setRenderingType(n) after this function call to prepare the whole program correctly.
         * @param {WebGLProgram} program WebGLProgram in use
         * @param {Object} shaderLayers map of shaderLayers to load {shaderID: ShaderLayer}
         */
        programLoaded(program, shaderLayers) {
            // console.log('ProgramLoaded called!');
            const gl = this.gl;
            gl.useProgram(this._secondPassProgram);

            // load clip and blend shaderLayer's glsl locations, load shaderLayer's control's glsl locations
            for (const shaderLayer of Object.values(shaderLayers)) {
                //console.log('Calling glLoaded on shaderLayer', shaderLayer.constructor.name(), shaderLayer);
                shaderLayer.glLoaded(program, gl);
            }


            // VERTEX shader's locations
            this._locationTransformMatrix = gl.getUniformLocation(program, "u_transform_matrix");
            this._locationNPassRendering = gl.getUniformLocation(program, "u_nPassRendering");


            // FRAGMENT shader's locations
            this._locationPixelSize = gl.getUniformLocation(program, "u_pixel_size_in_fragments");
            this._locationZoomLevel = gl.getUniformLocation(program, "u_zoom_level");
            this._locationGlobalAlpha = gl.getUniformLocation(program, "u_global_alpha");

            this._locationTextures = gl.getUniformLocation(program, "u_textures");
            this._locationShaderLayerIndex = gl.getUniformLocation(program, "u_shaderLayerIndex");


            // Initialize viewport attribute
            this._locationPosition = gl.getAttribLocation(program, "a_position");
            this._bufferPosition = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferPosition);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this._locationPosition);
            gl.vertexAttribPointer(this._locationPosition, 3, gl.FLOAT, false, 0, 0);


            // Initialize texture_coords attribute
            this._locationTextureCoords = gl.getAttribLocation(program, "a_texture_coords");
            this._bufferTextureCoords = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            // Fill the buffer with initial thrash and then call vertexAttribPointer.
            // This ensures correct buffer's initialization -> binds this._locationTextureCoords to this._bufferTextureCoords and tells webgl how to read the data from the buffer.
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]), gl.STATIC_DRAW);
            gl.enableVertexAttribArray(this._locationTextureCoords);
            gl.vertexAttribPointer(this._locationTextureCoords, 2, gl.FLOAT, false, 0, 0);


            // Initialize texture
            gl.uniform1i(this._locationTextures, 0);
            gl.activeTexture(gl.TEXTURE0);
        }


        /**
         * Fill the glsl variables and draw.
         * @param {WebGLProgram} program WebGLProgram in use

         * @param {object} tileInfo
         * @param {Float32Array} tileInfo.transform 3*3 matrix that should be applied to tile vertices
         * @param {Number} tileInfo.zoom
         * @param {Number} tileInfo.pixelSize
         * @param {Float32Array} tileInfo.textureCoords 8 suradnic, (2 pre kazdy vrchol triangle stripu)
         *
         * @param {ShaderLayer} shaderLayer shaderLayer
         * @param {string} controlId shaderLayer's control's id
         * @param {WebGLTexture} texture gl.TEXTURE_2D used as a source of data for rendering
         */
        programUsed(program, tileInfo, shaderLayer, shaderID, texture) {
            // console.debug('programUsed! texcoords:', tileInfo.textureCoords, 'transformMatrix:', tileInfo.transform);
            const gl = this.gl;

            // tell the controls to fill its uniforms
            shaderLayer.glDrawing(program, gl);

            // tell glsl which shaderLayer to use
            const shaderLayerIndex = this._shadersMapping[shaderID]; // malo by sediet ze controlID je to iste ako shaderID hadam...
            gl.uniform1i(this._locationShaderLayerIndex, shaderLayerIndex);


            // fill FRAGMENT shader's uniforms (that are unused)
            gl.uniform1f(this._locationPixelSize, tileInfo.pixelSize || 1);
            gl.uniform1f(this._locationZoomLevel, tileInfo.zoom || 1);
            // fill FRAGMENT shader's uniforms (that are used)
            gl.uniform1f(this._locationGlobalAlpha, tileInfo.globalOpacity || 1);


            // viewport attribute
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferPosition);
            gl.bufferData(gl.ARRAY_BUFFER, this._firstPassViewport, gl.STATIC_DRAW);


            // texture coords
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            gl.bufferData(gl.ARRAY_BUFFER, tileInfo.textureCoords, gl.STATIC_DRAW);


            // transform matrix
            gl.uniformMatrix3fv(this._locationTransformMatrix, false, tileInfo.transform);


            // texture
            gl.bindTexture(gl.TEXTURE_2D, texture);


            // draw triangle strip (two triangles) from a static array defined in the vertex shader,
            // 0: start reading vertex data from the first vertex,
            // 4: use 4 vertices per instance (to form one triangle strip)
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }


        /** Draw using firstPassProgram.
         * @param {WebGLTexture} texture gl.TEXTURE_2D used as a source of data for rendering
         * @param {Float32Array} textureCoords
         * @param {Float32Array} transformMatrix
         */
        firstPassProgramUsed(textureCoords, transformMatrix, texture) {
            // console.debug('Drawujem first pass programom! texcoords:', textureCoords, 'transformMatrix:', transformMatrix);
            const gl = this.gl;

            // Use shaderLayer for the first pass
            gl.uniform1i(this._locationShaderLayerIndex, -1);

            // Position
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferPosition);
            gl.bufferData(gl.ARRAY_BUFFER, this._firstPassViewport, gl.STATIC_DRAW);

            // Texture coords
            gl.bindBuffer(gl.ARRAY_BUFFER, this._bufferTextureCoords);
            gl.bufferData(gl.ARRAY_BUFFER, textureCoords, gl.STATIC_DRAW);

            // Transform matrix
            gl.uniformMatrix3fv(this._locationTransformMatrix, false, transformMatrix);

            // Texture
            gl.bindTexture(gl.TEXTURE_2D, texture);

            // Draw triangle strip (two triangles) from a static array defined in the vertex shader
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
    };

})(OpenSeadragon);
