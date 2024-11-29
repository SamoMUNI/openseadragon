// 40 riadkov

(function($) {
    /**
     * Identity shader
     *
     * data reference must contain one index to the data to render using identity
     */
    $.WebGLModule.FirstPassLayer = class extends $.WebGLModule.ShaderLayer {

        static type() {
            return "firstPass";
        }

        static name() {
            return "First pass shader";
        }

        // static singleSourceVariableCount}]

        static description() {
            return "Use to render the data AS-IS into an offscreen texture";
        }

        static sources() {
            return [{
                acceptsChannelCount: (x) => x === 4,
                description: "4d texture to render AS-IS"
            }];
        }

        getFragmentShaderDefinition() {
            return "";
        }

        getFragmentShaderExecution() {
            return `
        return ${this.sampleChannel("v_texture_coords", 0, true)};`;
        }

        // redefine these functions to ignore their calls from webGLContext's loadProgram and useProgram functions
        glLoaded() {
        }
        glDrawing() {
        }
    };

    //todo why cannot be inside object :/
    $.WebGLModule.FirstPassLayer.defaultControls["use_channel0"] = {
        required: "rgba"
    };

    $.WebGLModule.ShaderMediator.registerLayer($.WebGLModule.FirstPassLayer);

})(OpenSeadragon);
