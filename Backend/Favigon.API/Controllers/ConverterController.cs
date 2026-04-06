using Favigon.Application.DTOs.Requests;
using Favigon.Application.DTOs.Responses;
using Favigon.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Favigon.API.Controllers;

[ApiController]
[Route("api/converter")]
public class ConverterController(IConverterService converterService) : ControllerBase
{
    [HttpPost("generate")]
    public IActionResult Generate([FromBody] ConverterRequest request)
    {
        ConverterResponse result;

        if (request.Pages is { Count: > 1 })
        {
            result = converterService.GenerateResponsive(request.Pages, request.Framework);
        }
        else if (request.Ir is not null)
        {
            result = converterService.Generate(request.Ir, request.Framework);
        }
        else
        {
            throw new ArgumentException("Either 'ir' or 'pages' (2+ entries) is required.");
        }

        return Ok(result);
    }

    [HttpPost("validate")]
    public IActionResult Validate([FromBody] ConverterRequest request)
    {
        if (request.Ir is null)
            throw new ArgumentException("IR node is required.");

        var isValid = converterService.Validate(request.Ir);

        return Ok(new ConverterResponse
        {
            IsValid = isValid
        });
    }
}


