#include "ASCIIArt.h"
#include <cmath>
#include <cstring>
#include <algorithm>

// Character set patterns
static const char* PATTERN_1_CHARS = " .'`^\",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
static const char* PATTERN_2_CHARS = " .:-=+*#%@";
static const char* PATTERN_BINARY_CHARS = " 01010101";
static const char* PATTERN_BLOCKS_CHARS = " \xE2\x96\x91\xE2\x96\x92\xE2\x96\x93\xE2\x96\x88"; // Unicode block elements
static const char* PATTERN_SIMPLE_CHARS = " .:+*#@";

// 5x7 Font Bitmap representation for fallback native rasterization without GDI/DirectWrite
static const unsigned char FONT_5X7[128][7] = {
    // Basic ASCII font bitmaps for render loop
    [' ' ] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00},
    ['.' ] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C},
    [':' ] = {0x00, 0x0C, 0x0C, 0x00, 0x00, 0x0C, 0x0C},
    ['-' ] = {0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00},
    ['+' ] = {0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00},
    ['=' ] = {0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00},
    ['*' ] = {0x00, 0x0A, 0x04, 0x1F, 0x04, 0x0A, 0x00},
    ['#' ] = {0x0A, 0x0A, 0x1F, 0x0A, 0x1F, 0x0A, 0x0A},
    ['%' ] = {0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03},
    ['@' ] = {0x0E, 0x11, 0x17, 0x15, 0x17, 0x10, 0x0F},
    ['0' ] = {0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E},
    ['1' ] = {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E},
    ['$' ] = {0x04, 0x0F, 0x14, 0x0E, 0x05, 0x1E, 0x04},
    ['A' ] = {0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11},
    ['B' ] = {0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E},
    ['C' ] = {0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E},
    ['M' ] = {0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11},
    ['W' ] = {0x11, 0x11, 0x11, 0x15, 0x15, 0x1B, 0x11},
    ['X' ] = {0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11},
    // Default fallback line patterns for unmapped glyphs
};

static PF_Err About(
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output)
{
    AEGP_SuiteHandler suites(in_data->pica_basicP);
    suites.ANSICallbacksSuite1()->sprintf(
        out_data->return_msg,
        "ASCIIArt v%d.%d\n\nConverts video into stylized ASCII Art canvas.",
        MAJOR_VERSION, MINOR_VERSION);
    return PF_Err_NONE;
}

static PF_Err GlobalSetup(
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output)
{
    out_data->my_version = PF_VERSION(MAJOR_VERSION, MINOR_VERSION, BUG_VERSION, STAGE_VERSION, BUILD_VERSION);
    out_data->out_flags  = PF_OutFlag_DEEP_COLOR_AWARE | PF_OutFlag_I_EXPAND_BUFFER;
    return PF_Err_NONE;
}

static PF_Err ParamsSetup(
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output)
{
    PF_Err err = PF_Err_NONE;
    PF_ParamDef def;

    // ----------------------------------------------------
    // Resolution Options Group
    // ----------------------------------------------------
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_TOPIC(in_data, "Resolution Options", ASCII_RES_GROUP_START));

    // Block Size
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_SLIDER("Block Size",
                      1,    // MIN
                      100,  // MAX
                      1,    // SLIDER MIN
                      50,   // SLIDER MAX
                      10,   // DEFAULT
                      ASCII_BLOCK_SIZE));

    ERR(PF_END_TOPIC(in_data, ASCII_RES_GROUP_END));

    // ----------------------------------------------------
    // Character Options Group
    // ----------------------------------------------------
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_TOPIC(in_data, "Character Options", ASCII_CHAR_GROUP_START));

    // Character Size (Float Slider)
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_FLOAT_SLIDERX("Character Size",
                             0.10f,  // MIN
                             5.00f,  // MAX
                             0.50f,  // SLIDER MIN
                             3.00f,  // SLIDER MAX
                             1.30f,  // DEFAULT
                             2,      // PRECISION
                             0,      // DISPLAY FLAGS
                             0,      // WANT PHASES
                             ASCII_CHAR_SIZE));

    // Style Options Dropdown
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_POPUP("Style Options",
                     6, // NUM CHOICES
                     1, // DEFAULT (Pattern 1)
                     "Pattern 1|Pattern 2|Binary|Blocks|Simple|GBA Camera",
                     0,
                     ASCII_TEXT_PATTERN));

    // Reverse text pattern Checkbox
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_CHECKBOX("Reverse text pattern",
                        "Enabled",
                        FALSE,
                        0,
                        ASCII_REVERSE_PATTERN));

    // Letter Size based on brig Checkbox
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_CHECKBOX("Letter Size based on brig",
                        "Enabled",
                        FALSE,
                        0,
                        ASCII_LETTER_SIZE_BRIGHTNESS));

    ERR(PF_END_TOPIC(in_data, ASCII_CHAR_GROUP_END));

    // ----------------------------------------------------
    // Color Options Group
    // ----------------------------------------------------
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_TOPIC(in_data, "Color Options", ASCII_COLOR_GROUP_START));

    // Original Color Checkbox
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_CHECKBOX("Original Color",
                        "Enabled",
                        FALSE,
                        0,
                        ASCII_ORIGINAL_COLOR));

    // Custom Color Start
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_COLOR("Custom Color Start",
                     255, 255, 255, // DEFAULT WHITE
                     ASCII_CUSTOM_COLOR_START));

    // Custom Color End
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_COLOR("Custom Color End",
                     255, 255, 255, // DEFAULT WHITE
                     ASCII_CUSTOM_COLOR_END));

    // Background Color
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_COLOR("Background Color",
                     0, 0, 0, // DEFAULT BLACK
                     ASCII_BACKGROUND_COLOR));

    // Transparent Background Checkbox
    AEFX_CLR_STRUCT(def);
    ERR(PF_ADD_CHECKBOX("Transparent Background",
                        "Enabled",
                        FALSE,
                        0,
                        ASCII_TRANSPARENT_BG));

    ERR(PF_END_TOPIC(in_data, ASCII_COLOR_GROUP_END));

    out_data->num_params = ASCII_NUM_PARAMS;

    return err;
}

static PF_Err Render(
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output)
{
    PF_Err err = PF_Err_NONE;

    PF_LayerDef *input = &params[ASCII_INPUT]->u.ld;
    A_long width       = input->width;
    A_long height      = input->height;

    // Read parameter values
    A_long block_size          = params[ASCII_BLOCK_SIZE]->u.sd.value;
    PF_FpLong char_size        = params[ASCII_CHAR_SIZE]->u.fs_d.value;
    A_long text_pattern        = params[ASCII_TEXT_PATTERN]->u.pd.value;
    PF_Boolean reverse_pattern = params[ASCII_REVERSE_PATTERN]->u.bd.value;
    PF_Boolean size_by_brig    = params[ASCII_LETTER_SIZE_BRIGHTNESS]->u.bd.value;
    PF_Boolean orig_color      = params[ASCII_ORIGINAL_COLOR]->u.bd.value;
    PF_Pixel color_start       = params[ASCII_CUSTOM_COLOR_START]->u.cd.value;
    PF_Pixel color_end         = params[ASCII_CUSTOM_COLOR_END]->u.cd.value;
    PF_Pixel bg_color          = params[ASCII_BACKGROUND_COLOR]->u.cd.value;
    PF_Boolean transparent_bg  = params[ASCII_TRANSPARENT_BG]->u.bd.value;

    if (block_size < 1) block_size = 1;

    // Select character set based on pattern
    const char* char_set = PATTERN_1_CHARS;
    switch (text_pattern) {
        case PATTERN_2:      char_set = PATTERN_2_CHARS; break;
        case PATTERN_BINARY: char_set = PATTERN_BINARY_CHARS; break;
        case PATTERN_BLOCKS: char_set = PATTERN_BLOCKS_CHARS; break;
        case PATTERN_SIMPLE: char_set = PATTERN_SIMPLE_CHARS; break;
        default:             char_set = PATTERN_1_CHARS; break;
    }
    size_t char_set_len = strlen(char_set);

    // Clear output buffer with background color or transparent alpha
    for (A_long y = 0; y < height; ++y) {
        PF_Pixel *out_pixel = (PF_Pixel*)((char*)output->data + (y * output->rowbytes));
        for (A_long x = 0; x < width; ++x) {
            if (transparent_bg) {
                out_pixel->alpha = 0;
                out_pixel->red   = 0;
                out_pixel->green = 0;
                out_pixel->blue  = 0;
            } else {
                out_pixel->alpha = bg_color.alpha;
                out_pixel->red   = bg_color.red;
                out_pixel->green = bg_color.green;
                out_pixel->blue  = bg_color.blue;
            }
            out_pixel++;
        }
    }

    // Grid Loop across video frame
    for (A_long gy = 0; gy < height; gy += block_size) {
        for (A_long gx = 0; gx < width; gx += block_size) {
            
            // 1. Calculate Average Luminance and RGB in current block
            unsigned long r_sum = 0, g_sum = 0, b_sum = 0, a_sum = 0;
            A_long count = 0;

            A_long block_w = std::min(block_size, width - gx);
            A_long block_h = std::min(block_size, height - gy);

            for (A_long by = 0; by < block_h; ++by) {
                PF_Pixel *in_pixel = (PF_Pixel*)((char*)input->data + ((gy + by) * input->rowbytes)) + (gx);
                for (A_long bx = 0; bx < block_w; ++bx) {
                    r_sum += in_pixel->red;
                    g_sum += in_pixel->green;
                    b_sum += in_pixel->blue;
                    a_sum += in_pixel->alpha;
                    in_pixel++;
                    count++;
                }
            }

            if (count == 0) continue;

            u_char avg_r = (u_char)(r_sum / count);
            u_char avg_g = (u_char)(g_sum / count);
            u_char avg_b = (u_char)(b_sum / count);
            u_char avg_a = (u_char)(a_sum / count);

            // Luminance formula (ITU-R BT.601)
            float brightness = (0.299f * avg_r + 0.587f * avg_g + 0.114f * avg_b) / 255.0f;
            if (reverse_pattern) {
                brightness = 1.0f - brightness;
            }

            // Map brightness to character index
            int char_idx = (int)(brightness * (char_set_len - 1));
            if (char_idx < 0) char_idx = 0;
            if (char_idx >= (int)char_set_len) char_idx = (int)char_set_len - 1;
            char glyph = char_set[char_idx];

            // 2. Determine Color for Character
            PF_Pixel glyph_color;
            glyph_color.alpha = avg_a;

            if (orig_color) {
                glyph_color.red   = avg_r;
                glyph_color.green = avg_g;
                glyph_color.blue  = avg_b;
            } else {
                // Dual-tone lerp between Custom Color Start and End based on brightness
                glyph_color.red   = (u_char)(color_start.red   + brightness * (color_end.red   - color_start.red));
                glyph_color.green = (u_char)(color_start.green + brightness * (color_end.green - color_start.green));
                glyph_color.blue  = (u_char)(color_start.blue  + brightness * (color_end.blue  - color_start.blue));
            }

            // 3. Rasterize ASCII Character onto Output Buffer
            float effective_scale = (float)char_size;
            if (size_by_brig) {
                effective_scale *= (0.3f + 0.7f * brightness);
            }

            const unsigned char* bitmap = FONT_5X7[(unsigned char)glyph];
            int glyph_draw_w = (int)(5 * effective_scale);
            int glyph_draw_h = (int)(7 * effective_scale);

            A_long start_x = gx + (block_size - glyph_draw_w) / 2;
            A_long start_y = gy + (block_size - glyph_draw_h) / 2;

            for (int py = 0; py < glyph_draw_h; ++py) {
                A_long target_y = start_y + py;
                if (target_y < 0 || target_y >= height) continue;

                int bit_y = (int)(py / effective_scale);
                if (bit_y > 6) bit_y = 6;
                unsigned char row_bits = bitmap[bit_y];

                PF_Pixel *row_ptr = (PF_Pixel*)((char*)output->data + (target_y * output->rowbytes));

                for (int px = 0; px < glyph_draw_w; ++px) {
                    A_long target_x = start_x + px;
                    if (target_x < 0 || target_x >= width) continue;

                    int bit_x = 4 - (int)(px / effective_scale);
                    if (bit_x < 0) bit_x = 0;

                    if ((row_bits >> bit_x) & 1) {
                        row_ptr[target_x] = glyph_color;
                    }
                }
            }
        }
    }

    return err;
}

DllExport PF_Err EntryPointFunc(
    PF_Cmd          cmd,
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output,
    void            *extra)
{
    PF_Err err = PF_Err_NONE;

    try {
        switch (cmd) {
            case PF_Cmd_ABOUT:
                err = About(in_data, out_data, params, output);
                break;
            case PF_Cmd_GLOBAL_SETUP:
                err = GlobalSetup(in_data, out_data, params, output);
                break;
            case PF_Cmd_PARAMS_SETUP:
                err = ParamsSetup(in_data, out_data, params, output);
                break;
            case PF_Cmd_RENDER:
                err = Render(in_data, out_data, params, output);
                break;
        }
    } catch (...) {
        err = PF_Err_INTERNAL_STRUCT_DAMAGED;
    }

    return err;
}
