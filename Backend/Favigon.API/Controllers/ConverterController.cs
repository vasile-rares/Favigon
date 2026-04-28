using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Favigon.Application.Validators;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/converter")]
[EnableRateLimiting("converter")]
public class ConverterController(IConverterService converterService) : ControllerBase
{
    [HttpPost("generate")]
    public IActionResult Generate(
        [FromBody] ConverterRequest request,
        [FromServices] ConverterGenerateValidator validator)
    {
        var validation = validator.Validate(request);
        if (!validation.IsValid)
            return BadRequest(new ProblemDetails
            {
                Status = 400,
                Title = validation.Errors[0].ErrorMessage
            });

        ConverterResponse result;

        if (request.Pages is { Count: > 1 })
        {
            result = converterService.GenerateResponsive(request.Pages, request.Framework);
        }
        else
        {
            result = converterService.Generate(request.Ir!, request.Framework);
        }

        return Ok(result);
    }

    [HttpPost("validate")]
    public IActionResult Validate(
        [FromBody] ConverterRequest request,
        [FromServices] ConverterValidateValidator validator)
    {
        var validation = validator.Validate(request);
        if (!validation.IsValid)
            return BadRequest(new ProblemDetails
            {
                Status = 400,
                Title = validation.Errors[0].ErrorMessage
            });

        var isValid = converterService.Validate(request.Ir!);

        return Ok(new ConverterResponse
        {
            IsValid = isValid
        });
    }

    [HttpPost("generate-files")]
    public IActionResult GenerateFiles(
        [FromBody] ConverterRequest request,
        [FromServices] ConverterGenerateFilesValidator validator)
    {
        var validation = validator.Validate(request);
        if (!validation.IsValid)
            return BadRequest(new ProblemDetails
            {
                Status = 400,
                Title = validation.Errors[0].ErrorMessage
            });

        var result = converterService.GenerateMultiPage(request.Pages!, request.Framework);
        return Ok(result);
    }
}

