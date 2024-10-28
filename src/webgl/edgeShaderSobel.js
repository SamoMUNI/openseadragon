// #version 300 es
// precision mediump float;

// uniform sampler2D u_texture;      // Texture from the first pass
// uniform float u_textureWidth;     // Width of the texture
// uniform float u_textureHeight;    // Height of the texture

// in vec2 v_texture_coords;         // Texture coordinates
// out vec4 fragColor;               // Output color

// void main() {
//     // Calculate texel size for accurate sampling
//     vec2 texelSize = vec2(1.0 / u_textureWidth, 1.0 / u_textureHeight);

//     // Sample the neighboring pixels for the Sobel filter
//     float topLeft     = texture(u_texture, v_texture_coords + texelSize * vec2(-1.0,  1.0)).r;
//     float top         = texture(u_texture, v_texture_coords + texelSize * vec2( 0.0,  1.0)).r;
//     float topRight    = texture(u_texture, v_texture_coords + texelSize * vec2( 1.0,  1.0)).r;
//     float left        = texture(u_texture, v_texture_coords + texelSize * vec2(-1.0,  0.0)).r;
//     float right       = texture(u_texture, v_texture_coords + texelSize * vec2( 1.0,  0.0)).r;
//     float bottomLeft  = texture(u_texture, v_texture_coords + texelSize * vec2(-1.0, -1.0)).r;
//     float bottom      = texture(u_texture, v_texture_coords + texelSize * vec2( 0.0, -1.0)).r;
//     float bottomRight = texture(u_texture, v_texture_coords + texelSize * vec2( 1.0, -1.0)).r;

//     // Apply Sobel kernel for x and y gradients
//     float edge_x = (topRight + 2.0 * right + bottomRight) - (topLeft + 2.0 * left + bottomLeft);
//     float edge_y = (bottomLeft + 2.0 * bottom + bottomRight) - (topLeft + 2.0 * top + topRight);

//     // Calculate edge intensity (magnitude of the gradient)
//     float edgeIntensity = length(vec2(edge_x, edge_y));

//     // Output edge-detected color (use edgeIntensity for grayscale or color mapping)
//     fragColor = vec4(vec3(edgeIntensity), 1.0); // Output in grayscale
// }



(function($) {
    /**
     * Edges shader
     * data reference must contain one index to the data to render using edges strategy
     *
     * $_GET/$_POST expected parameters:
     *  index - unique number in the compiled shader
     * $_GET/$_POST supported parameters:
     *  color - for more details, see @WebGLModule.UIControls color UI type
     *  edgeThickness - for more details, see @WebGLModule.UIControls number UI type
     *  threshold - for more details, see @WebGLModule.UIControls number UI type
     *  opacity - for more details, see @WebGLModule.UIControls number UI type
     */
    $.WebGLModule.EdgeLayer = class extends $.WebGLModule.ShaderLayer {

        static type() {
            return "edgeSobel";
        }

        static name() {
            return "EdgesSobel";
        }

        static description() {
            return "highlights edges using Sobel filter";
        }

        static sources() {
            return [{
                acceptsChannelCount: (x) => x === 4,
                description: "4D data to detect edges"
            }];
        }

        getFragmentShaderExecution() {
            return `
        // Calculate texel size for accurate sampling
        vec2 texelSize = vec2(1.0 / u_textureWidth, 1.0 / u_textureHeight);

        // Sample the neighboring pixels for the Sobel filter
        float topLeft     = osd_texture(0, v_texture_coords + texelSize * vec2(-1.0,  1.0)).r;
        float top         = osd_texture(0, v_texture_coords + texelSize * vec2( 0.0,  1.0)).r;
        float topRight    = osd_texture(0, v_texture_coords + texelSize * vec2( 1.0,  1.0)).r;
        float left        = osd_texture(0, v_texture_coords + texelSize * vec2(-1.0,  0.0)).r;
        float right       = osd_texture(0, v_texture_coords + texelSize * vec2( 1.0,  0.0)).r;
        float bottomLeft  = osd_texture(0, v_texture_coords + texelSize * vec2(-1.0, -1.0)).r;
        float bottom      = osd_texture(0, v_texture_coords + texelSize * vec2( 0.0, -1.0)).r;
        float bottomRight = osd_texture(0, v_texture_coords + texelSize * vec2( 1.0, -1.0)).r;

        // Apply Sobel kernel for x and y gradients
        float edge_x = (topRight + 2.0 * right + bottomRight) - (topLeft + 2.0 * left + bottomLeft);
        float edge_y = (bottomLeft + 2.0 * bottom + bottomRight) - (topLeft + 2.0 * top + topRight);

        // Calculate edge intensity (magnitude of the gradient)
        float edgeIntensity = length(vec2(edge_x, edge_y));

        // Output edge-detected color (use edgeIntensity for grayscale or color mapping)
        // return osd_texture(0, v_texture_coords);
        // return vec4(1.0, 0.0, 0.0, 1.0);
        // return vec4(vec3(left), 1.0);
        // return vec4(v_texture_coords, 0.0, 1.0); // Displays coordinates as color. This should result in a smooth gradient from black (bottom left) to white (top right) across the whole render target. If you see bands or discontinuities, it indicates that v_texture_coords are not covering the entire texture as expected.

        return vec4(vec3(edgeIntensity), 1.0); // Output in grayscale

        // vec2 leftCoords = clamp(v_texture_coords + texelSize * vec2(-1.0, 0.0), 0.0, 1.0);
        // vec2 rightCoords = clamp(v_texture_coords + texelSize * vec2(1.0, 0.0), 0.0, 1.0);
        // vec2 topCoords = clamp(v_texture_coords + texelSize * vec2(0.0, 1.0), 0.0, 1.0);
        // vec2 bottomCoords = clamp(v_texture_coords + texelSize * vec2(0.0, -1.0), 0.0, 1.0);

        // vec3 color = osd_texture(0, v_texture_coords).rgb;
        // vec3 leftColor = osd_texture(0, leftCoords).rgb;
        // vec3 rightColor = osd_texture(0, rightCoords).rgb;
        // vec3 topColor = osd_texture(0, topCoords).rgb;
        // vec3 bottomColor = osd_texture(0, bottomCoords).rgb;

        // return vec4((color + leftColor + rightColor + topColor + bottomColor) * 0.2, 1.0);
    `;
        }
    };

    $.WebGLModule.EdgeLayer.defaultControls = {};

    $.WebGLModule.ShaderMediator.registerLayer($.WebGLModule.EdgeLayer);

})(OpenSeadragon);
